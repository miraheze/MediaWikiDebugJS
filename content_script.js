// In the format of: 'hostname': 'selector'
// Add more wiki farms as needed (alphabetical order)
const WIKI_FARMS = {
	'editthis.info': 'editthis.info',
	'fandom.com': 'static.wikia.nocookie.net',
	'inside.wf': 'static.wikiforge.net',
	'miraheze.org': 'matomo.miraheze.org',
	'shoutwiki-servers.com': 'www.shoutwiki.com',
	'telepedia.net': 'static.telepedia.net',
	'wikimedia.org': 'upload.wikimedia.org',
	'wikitide.net': 'analytics.wikitide.net',
	'wiki.gg': 'app.wiki.gg',
};

// In the format of: skinname: 'selector'
// Add more skin selectors as needed
const SKIN_SELECTORS = {
	citizen: '.citizen-footer__siteinfo',
	cosmos: '#p-tb ul',
	fandomdesktop: '.page-footer',
	minerva: 'ul#p-personal',
	'vector-2022': '.mw-content-container',
	default: '#p-personal ul',
};

const cache = {};
const cacheDuration = 1000 * 60 * 5; // 5 minutes

function getMediaWikiVariable(variable) {
	const nodes = document.querySelectorAll('script');
	let match;

	for (const node of nodes) {
		match = new RegExp(`"${variable}":\\s*"?([^("|}|,)]+)"?`).exec(node.innerText);
		if (match) {
			return match[1];
		}
	}

	return null;
}

function parseHttpHeaders(httpHeaders) {
	return httpHeaders.split("\n").map(x => x.split(/: */, 2)).filter(x => x[0]).reduce((ac, x) => {
		ac[x[0]] = x[1];
		return ac;
	}, {});
}

function getXservedBy(headers) {
	const xservedByHeader = headers['x-datacenter'] || headers['x-served-by'];
	if (xservedByHeader) {
		const xservedByValues = xservedByHeader.split(',');
		return xservedByValues.length > 1 ? xservedByValues[1] : xservedByValues[0];
	}

	return '';
}

async function getBackendResponseTime() {
	const respTime = getMediaWikiVariable('wgBackendResponseTime');
	if (respTime) {
		return respTime;
	}

	const sendDate = new Date().getTime();
	try {
		const response = await fetch(window.location.href);
		const receiveDate = new Date().getTime();
		const responseTimeMs = receiveDate - sendDate;
		return Promise.resolve(responseTimeMs);
	} catch (error) {
		console.log('Could not fetch URL:', window.location.href);
	}
}

// If it has matomo, we can try to use that to
// extract wiki database name
function getMatomoScript() {
	const scripts = document.querySelectorAll('script');
	for (const script of scripts) {
		const scriptContent = script.textContent;
		if (scriptContent.includes('matomo.js') && scriptContent.includes('setDocumentTitle')) {
			return scriptContent;
		}
	}

	return null;
}

function getDBNameFromMatomoScript() {
	const matomoScript = getMatomoScript();
	if (!matomoScript) {
		return null;
	}

	const setDocumentTitleMatch = matomoScript.match(/_paq.push\(\['setDocumentTitle', "(.+?)".+?\]\)/);
	return setDocumentTitleMatch ? setDocumentTitleMatch[1] : null;
}

function getDBNameFromComment() {
	const dbNameRegex = /Saved in parser cache with key\s*([\w:]+?)\s*:/;
	const match = document.documentElement.outerHTML.match(dbNameRegex);
	return match ? match[1] : null;
}

function getDBName() {
	const wgDBname = getMediaWikiVariable('wgDBname') || getMediaWikiVariable('wikiDbName') || getDBNameFromComment();
	if (wgDBname) {
		return wgDBname;
	}

	return getDBNameFromMatomoScript();
}

function checkHtmlHead() {
	if (!document.body.classList.contains('mediawiki')) {
		return;
	}

	const headContent = document.head.innerHTML;

	const includesAnyOf = (string, substrings) => substrings.some(substring => string.includes(substring));

	const matchingWikiFarms = Object.entries(WIKI_FARMS).filter(([_, selector]) => includesAnyOf(headContent, [selector]));

	if (matchingWikiFarms.length === 0) {
		return; // No matching wiki farms found in the HTML head
	}

	const xhr = new XMLHttpRequest();
	xhr.open('HEAD', document.location);
	xhr.send();

	xhr.onload = async function () {
		const headers = parseHttpHeaders(xhr.getAllResponseHeaders()),
			respTime = getMediaWikiVariable('wgBackendResponseTime') || await getBackendResponseTime(),
			backendHeader = headers['x-powered-by'],
			backend = backendHeader ? `PHP${backendHeader.replace(/^PHP\/([0-9]+).*/, '$1')}` : 'PHP',
			server = getMediaWikiVariable('wgHostname') ? getMediaWikiVariable('wgHostname').replace(new RegExp('.' + matchingWikiFarms[0][0].replace(/\./g, '\\.') + '$'), '') : '',
			cp = getXservedBy(headers).replace(new RegExp('.' + matchingWikiFarms.map(([wikiFarm]) => wikiFarm).join('|') + '|cache-(yvr|den|bfi-krnt)|^mw[0-9]+|^test[0-9]+|\\s', 'g'), ''),
			dbname = getDBName() || '',
			info = `${respTime}ms (<b>${backend.trim()}</b>${(dbname || server || cp) ? ` via ${dbname}${server || cp ? `${dbname ? '@' : ''}${server}` : ''}${cp ? `${server ? ' / ' : ''}${cp}` : ''}` : ''})`;

		const skinMatches = [...document.body.className.matchAll(/skin-([a-z]+(?:-[0-9]+)?)/g)];
		const skin = Array.from(new Set(skinMatches.map(match => match[1])));
		const skinName = skin ? skin[1] || skin[0] : '';

		const skinSelector = SKIN_SELECTORS[skinName] || SKIN_SELECTORS['default'];

		const targetElement = document.querySelector(skinSelector);
		if (!targetElement) {
			return; // No matching target element found for the skin selector
		}

		const liInfoElement = document.createElement('li');
		liInfoElement.innerHTML = info;

		targetElement.appendChild(liInfoElement);

		const apiUrl = '/w/api.php';
		const fallbackApiUrl = '/api.php';

		if (cache.hasOwnProperty(apiUrl) && (Date.now() - cache[apiUrl].timestamp) < cacheDuration) {
			handleApiResponse(cache[apiUrl].data, targetElement);
		} else {
			fetchData(apiUrl, data => {
				cache[apiUrl] = {
					data,
					timestamp: Date.now(),
				};
				handleApiResponse(data, targetElement);
			})
			.catch(() => {
				console.log('Error fetching data from API URL. Trying fallback.');
				fetchData(fallbackApiUrl, fallbackData => {
					cache[apiUrl] = {
						data: fallbackData,
						timestamp: Date.now(),
					};
					handleApiResponse(fallbackData, targetElement);
				})
				.catch(fallbackError => {
					console.log('Error fetching data from fallback API URL.');
				});
			});
		}
	};
}

function handleApiResponse(data, targetElement) {
	const jobs = data?.query?.statistics?.jobs;
	if (jobs || jobs === 0) {
		const caption = `Queued Jobs: ${jobs}`;

		const liJobsElement = document.createElement('li');
		liJobsElement.innerHTML = caption;

		targetElement.appendChild(liJobsElement);
	}
}

function fetchData(url, callback) {
	const params = {
		action: 'query',
		meta: 'siteinfo',
		siprop: 'statistics',
		format: 'json',
	};

	return fetch(`${url}?${new URLSearchParams(params)}`)
		.then(response => {
			if (!response.ok) {
				throw new Error('Network response was not ok');
			}
			return response.json();
		})
		.then(data => {
			callback(data);
		})
		.catch(error => {
			console.log(`Error fetching data from ${url}.`);
			throw error;
		});
}

window.onload = checkHtmlHead();

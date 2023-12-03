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

// Equivalent to `mw.config.get('variable')`. We have to scrape the value
// from the script source because Chrome extension content scripts do not share
// an execution environment with other JavaScript code.
function getMediaWikiVariable(variable) {
	const nodes = document.querySelectorAll('script');
	var i, match;

	for (i = 0; i < nodes.length; i++) {
		match = new RegExp('"' + variable + '":\\s*"?([^("|}|,)]+)"?').exec(nodes[i].innerText);
		if (match) {
			return match[1];
		}
	}
}

async function getBackendResponseTime() {
	const respTime = getMediaWikiVariable('wgBackendResponseTime');
	if (respTime) {
		return respTime;
	}

	const sendDate = new Date().getTime();
	return fetch(window.location.href)
		.then(function(response) {
			const receiveDate = new Date().getTime();
			const responseTimeMs = receiveDate - sendDate;
			return Promise.resolve(responseTimeMs);
		})
		.catch(function(error) {
			console.log('Could not fetch URL: ' + window.location.href);
		});
}

function parseHttpHeaders(httpHeaders) {
	return httpHeaders.split("\n").map(function (x) {
		return x.split(/: */, 2);
	}).filter(function (x) {
		return x[0];
	}).reduce(function (ac, x) {
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

function getBackendResponseTime() {
	const respTime = getMediaWikiVariable('wgBackendResponseTime');
	if (respTime) {
		return respTime;
	}

	const sendDate = new Date().getTime();
	fetch(window.location.href)
  		.then(function(response) {
    			const receiveDate = new Date().getTime();
    			const responseTimeMs = receiveDate - sendDate;
			return responseTimeMs;
		})
		.catch(function(error) {
			console.log('Could not fetch URL: ' + window.location.href);
		});
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

function getDBName() {
	const wgDBname = getMediaWikiVariable('wgDBname') || getMediaWikiVariable('wikiDbName');
	if (wgDBname) {
		return wgDBname;
	}

	return getDBNameFromMatomoScript();
}

async function checkHtmlHead() {
	const headContent = document.head.innerHTML;

	const includesAnyOf = (string, substrings) => {
		return substrings.some((substring) => string.includes(substring));
	};

	const matchingWikiFarms = Object.entries(WIKI_FARMS).filter(([_, selector]) => {
		return includesAnyOf(headContent, [selector]);
	});

	if (matchingWikiFarms.length === 0) {
		return; // No matching wiki farms found in the HTML head
	}

	const xhr = new XMLHttpRequest();
	xhr.open('HEAD', document.location);
	xhr.send();

	xhr.onload = function () {
		const headers = parseHttpHeaders(xhr.getAllResponseHeaders()),
			respTime = getMediaWikiVariable('wgBackendResponseTime') || await getBackendResponseTime(),
			backendHeader = headers['x-powered-by'],
			backend = backendHeader ? `PHP${backendHeader.replace(/^PHP\/([0-9]+).*/, '$1')}` : 'PHP',
			server = getMediaWikiVariable('wgHostname') ? getMediaWikiVariable('wgHostname').replace(new RegExp('.' + matchingWikiFarms[0][0].replace(/\./g, '\\.') + '$'), '') : '',
			cp = getXservedBy(headers).replace(new RegExp('.' + matchingWikiFarms.map(wikiFarm => wikiFarm[0]).join('|') + '|cache-(yvr|den)|^mw[0-9]+|^test[0-9]+|\\s', 'g'), ''),
			dbname = getDBName() || '',
			info = respTime.toString() + 'ms (<b>' + backend + '</b> via ' + dbname + (server || cp ? (dbname ? '@' : '') + server : '') + (cp ? (server ? ' / ' : '') + cp : '') + ')';

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
			fetchData(apiUrl, function (data) {
				cache[apiUrl] = {
					data: data,
					timestamp: Date.now(),
				};
				handleApiResponse(data, targetElement);
			})
			.catch(function () {
				// If an error occurs with the primary URL, try the fallback URL
				console.log('Error fetching data from API URL. Trying fallback.');
				fetchData(fallbackApiUrl, function (fallbackData) {
					cache[apiUrl] = {
						data: fallbackData,
						timestamp: Date.now(),
					};
					handleApiResponse(fallbackData, targetElement);
				})
				.catch(function (fallbackError) {
					console.log('Error fetching data from fallback API URL.');
				});
			});
		}
	};
}

function handleApiResponse(data, targetElement) {
	const jobs = data?.query?.statistics?.jobs;
	if (jobs || jobs === 0) {
		const caption = 'Queued Jobs: ' + jobs;

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

	return fetch(url + '?' + new URLSearchParams(params))
		.then(function (response) {
			if (!response.ok) {
				throw new Error('Network response was not ok');
			}
			return response.json();
		})
		.then(function (data) {
			callback(data);
		})
		.catch(function (error) {
			console.log(`Error fetching data from ${url}.`);
			throw error;
		});
}

window.onload = checkHtmlHead();

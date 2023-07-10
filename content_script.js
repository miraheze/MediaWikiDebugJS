// In the format of: 'hostname': 'selector'
const WIKI_FARMS = {
	// Covers both WikiForge and WikiTide
	'wikiforge.net': 'static.wikiforge.net',
	// Add more wiki farms here as needed
};

// In the format of: skinname: 'selector'
const SKIN_SELECTORS = {
	cosmos: '#p-tb ul',
	minerva: 'ul#p-personal',
	// Add more skin selectors here as needed
};

const cache = {};
const cacheDuration = 300000; // 5 minutes

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

function checkHtmlBody() {
	const bodyContent = document.body.innerHTML;

	const includesAnyOf = (string, substrings) => {
		return substrings.some((substring) => string.includes(substring));
	};

	const matchingWikiFarms = Object.entries(WIKI_FARMS).filter(([domain]) => {
		return includesAnyOf(bodyContent, [domain]);
	});

	if (matchingWikiFarms.length === 0) {
		return; // No matching wiki farms found in the HTML body
	}

	const xhr = new XMLHttpRequest();
	xhr.open('HEAD', document.location);
	xhr.send();

	xhr.onload = function () {
		const headers = parseHttpHeaders(xhr.getAllResponseHeaders()),
			respTime = getMediaWikiVariable('wgBackendResponseTime'),
			backend = 'PHP7',
			server = getMediaWikiVariable('wgHostname'),
			cp = (headers['x-served-by'] ? headers['x-served-by'] : '').replace(/.wikiforge.net|^mw[0-9]+|^test[0-9]+|\s|,/g, ''),
			dbname = getMediaWikiVariable('wgDBname') || 'unknown',
			info = respTime.toString() + 'ms (<b>' + backend + '</b> via ' + dbname + '@' + server + (cp ? ' / ' + cp : '') + ')';

		const skin = document.body.className.match(/skin-([a-z]+)/);
		const skinName = skin ? skin[1] : '';

		const matchingSkinSelectors = matchingWikiFarms.reduce((selectors, [domain, selector]) => {
			const wikiFarmSelector = selector ? `.${selector}` : '';
			const skinSelector = SKIN_SELECTORS[skinName + wikiFarmSelector];
			if (skinSelector) {
				selectors.push(skinSelector);
			}
			return selectors;
		}, []);

		if (matchingSkinSelectors.length === 0) {
			return; // No matching skin selectors found for the wiki farms
		}

		const liInfoElement = document.createElement('li');
		liInfoElement.innerHTML = info;

		matchingSkinSelectors.forEach((skinSelector) => {
			const targetElement = document.querySelector(skinSelector);
			if (targetElement) {
				targetElement.appendChild(liInfoElement.cloneNode(true));
			}
		});

		const apiUrl = '/w/api.php';
		const params = {
			action: 'query',
			meta: 'siteinfo',
			siprop: 'statistics',
			format: 'json',
		};

		if (cache.hasOwnProperty(apiUrl) && (Date.now() - cache[apiUrl].timestamp) < cacheDuration) {
			handleApiResponse(cache[apiUrl].data, matchingSkinSelectors);
		} else {
			fetch(apiUrl + '?' + new URLSearchParams(params))
				.then(function (response) {
					return response.json();
				})
				.then(function (data) {
					cache[apiUrl] = {
						data: data,
						timestamp: Date.now(),
					};

					handleApiResponse(data, matchingSkinSelectors);
				});
		}
	};
}

function handleApiResponse(data, matchingSkinSelectors) {
	const jobs = data.query.statistics.jobs;
	const caption = 'Queued Jobs: ' + jobs;

	const liJobsElement = document.createElement('li');
	liJobsElement.innerHTML = caption;

	matchingSkinSelectors.forEach((skinSelector) => {
		const targetElement = document.querySelector(skinSelector);
		if (targetElement) {
			targetElement.appendChild(liJobsElement.cloneNode(true));
		}
	});
}

checkHtmlBody();

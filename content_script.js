// In the format of: 'hostname': 'selector'
// Add more wiki farms as needed
const WIKI_FARMS = {
	'fandom.com': 'static.wikia.nocookie.net',
	'miraheze.org': 'static.miraheze.org',
	'wikiforge.net': 'static.wikiforge.net',
};

const CP_HEADERS = {
	'fandom.com': 'x-datacenter',
	'default': 'x-served-by',
};

const DB_NAMES = {
	'fandom.com': 'wikiDbName',
	'default': 'wgDBname',
};

const API_URLS = {
	'fandom.com': '/api.php',
	'default': '/w/api.php',
};

// In the format of: skinname: 'selector'
// Add more skin selectors as needed
const SKIN_SELECTORS = {
	cosmos: '#p-tb ul',
	fandomdesktop: '.page-footer',
	minerva: 'ul#p-personal',
	default: '#p-personal ul',
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

function checkHtmlHead() {
	const headContent = document.head.innerHTML;

	const includesAnyOf = (string, substrings) => {
		return substrings.some((substring) => string.includes(substring));
	};

	const matchingWikiFarms = Object.entries(WIKI_FARMS).filter(([domain]) => {
		return includesAnyOf(headContent, [domain]);
	});

	if (matchingWikiFarms.length === 0) {
		return; // No matching wiki farms found in the HTML head
	}

	const xhr = new XMLHttpRequest();
	xhr.open('HEAD', document.location);
	xhr.send();

	xhr.onload = function () {
		const headers = parseHttpHeaders(xhr.getAllResponseHeaders()),
			respTime = getMediaWikiVariable('wgBackendResponseTime'),
			backendHeader = headers['x-powered-by'],
			backend = backendHeader ? `PHP${backendHeader.replace(/^PHP\/([0-9]+).*/, '$1')}` : 'PHP',
			server = getMediaWikiVariable('wgHostname') ? getMediaWikiVariable('wgHostname').replace(new RegExp('.' + matchingWikiFarms[0][0].replace(/\./g, '\\.') + '$'), '') : '',
			cpHeader = CP_HEADERS[matchingWikiFarms[0][0]] || CP_HEADERS['default'],
			cp = (headers[cpHeader] ? headers[cpHeader] : '').replace(new RegExp('.' + matchingWikiFarms[0][0] + '|^mw[0-9]+|^test[0-9]+|\\s|,', 'g'), ''),
			dbname = getMediaWikiVariable(DB_NAMES[matchingWikiFarms[0][0]] || DB_NAMES['default']) || 'unknownwiki',
			info = respTime.toString() + 'ms (<b>' + backend + '</b> via ' + dbname + (server || cp ? '@' + server : '') + (cp ? (server ? ' / ' : '') + cp : '') + ')';

		const skin = document.body.className.match(/skin-([a-z]+)/);
		const skinName = skin ? skin[1] : '';

		const skinSelector = SKIN_SELECTORS[skinName] || SKIN_SELECTORS['default'];

		const targetElement = document.querySelector(skinSelector);
		if (!targetElement) {
			return; // No matching target element found for the skin selector
		}

		const liInfoElement = document.createElement('li');
		liInfoElement.innerHTML = info;

		targetElement.appendChild(liInfoElement);

		const apiUrl = API_URLS[matchingWikiFarms[0][0]] || API_URLS['default'];
		const params = {
			action: 'query',
			meta: 'siteinfo',
			siprop: 'statistics',
			format: 'json',
		};

		if (cache.hasOwnProperty(apiUrl) && (Date.now() - cache[apiUrl].timestamp) < cacheDuration) {
			handleApiResponse(cache[apiUrl].data, targetElement);
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

					handleApiResponse(data, targetElement);
				});
		}
	};
}

function handleApiResponse(data, targetElement) {
	const jobs = data.query.statistics.jobs;
	const caption = 'Queued Jobs: ' + jobs;

	const liJobsElement = document.createElement('li');
	liJobsElement.innerHTML = caption;

	targetElement.appendChild(liJobsElement);
}

window.onload = checkHtmlHead();

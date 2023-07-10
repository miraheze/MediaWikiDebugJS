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

const cache = {};

// Two minutes
const cacheDuration = 120000;

function checkHtmlBody() {
	if (document.body.innerHTML.includes("wikiforge")) {
		const xhr = new XMLHttpRequest();
		xhr.open('HEAD', document.location);
		xhr.send();

		xhr.onload = function () {
			const headers = parseHttpHeaders(xhr.getAllResponseHeaders()),
				respTime = getMediaWikiVariable('wgBackendResponseTime'),
				backend = 'PHP7',
				server = getMediaWikiVariable('wgHostname').replace('.wikiforge.net', ''),
				cp = (headers['x-served-by'] ? headers['x-served-by'] : '').replace(/.wikiforge.net|^mw[0-9]+|^test[0-9]+|\s|,/g, ''),
				dbname = getMediaWikiVariable('wgDBname') || 'unknown',
				info = respTime.toString() + 'ms (<b>' + backend + '</b> via ' + dbname + '@' + server + (cp ? ' / ' + cp : '') + ')';

			const skin = document.body.className.match(/skin-([a-z]+)/);
			const skinName = skin ? skin[1] : '';

			if (skinName === 'cosmos') {
				const liInfoElement = document.createElement('li');
				liInfoElement.innerHTML = info;
				document.querySelector('#p-tb ul').appendChild(liInfoElement);
			} else {
				const liInfoElement = document.createElement('li');
				liInfoElement.innerHTML = info;
				document.querySelector('#p-personal ul').appendChild(liInfoElement);
			}

			const apiUrl = '/w/api.php';
			const params = {
				action: 'query',
				meta: 'siteinfo',
				siprop: 'statistics',
				format: 'json',
			};

			// Check if the API response is cached and not expired
			if (cache.hasOwnProperty(apiUrl) && (Date.now() - cache[apiUrl].timestamp) < cacheDuration) {
				handleApiResponse(cache[apiUrl].data);
			} else {
				// Fetch the API response
				fetch(apiUrl + '?' + new URLSearchParams(params))
					.then(function (response) {
						return response.json();
					})
					.then(function (data) {
						// Cache the API response with the timestamp
						cache[apiUrl] = {
							data: data,
							timestamp: Date.now()
						};

						handleApiResponse(data);
					});
			}
		};
	}
}

function handleApiResponse(data) {
	const jobs = data.query.statistics.jobs,
		caption = 'Queued Jobs: ' + jobs;

	const skin = document.body.className.match(/skin-([a-z]+)/);
	const skinName = skin ? skin[1] : '';

	if (skinName === 'cosmos') {
		const liJobsElement = document.createElement('li');
		liJobsElement.innerHTML = caption;
		document.querySelector('#p-tb ul').appendChild(liJobsElement);
	} else {
		const liJobsElement = document.createElement('li');
		liJobsElement.innerHTML = caption;
		document.querySelector('#p-personal ul').appendChild(liJobsElement);
	}
}

checkHtmlBody();

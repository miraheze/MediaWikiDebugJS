( function ( $, mw ) {
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
	if (document.body.innerHTML.includes("wikiforge")) {
		const xhr = new XMLHttpRequest();
		xhr.open('HEAD', document.location);
		xhr.send();

		xhr.onload = function () {
			const headers = parseHttpHeaders(xhr.getAllResponseHeaders()),
				respTime = mw.config.get('wgBackendResponseTime'),
				backend = 'PHP7',
				server = mw.config.get('wgHostname').replace('.wikiforge.net', ''),
				cp = (headers['x-served-by'] ? headers['x-served-by'] : '').replace(/.wikiforge.net|^mw[0-9]+|^test[0-9]+|\s|,/g, ''),
				dbname = mw.config.get('wgDBname'),
				info = respTime.toString() + 'ms (<b>' + backend + '</b> via ' + dbname + '@' + server + (cp ? ' / ' + cp : '') + ')';

			if (mw.config.get('skin') === 'cosmos') {
				$('<li>').html(info).appendTo('#p-tb ul');
			} else {
				$('<li>').html(info).prependTo('#p-personal ul');
			}

			$.when(mw.loader.using(["mediawiki.api"])).then(function () {
				return new mw.Api()
					.get({
						action: "query",
						meta: "siteinfo",
						siprop: "statistics",
						format: "json",
					})
					.then(function (data) {
						const jobs = data.query.statistics.jobs,
							caption = 'Queued Jobs: ' + jobs;

						if (mw.config.get('skin') === 'cosmos') {
							$('<li>').html(caption).appendTo('#p-tb ul');
						} else {
							$('<li>').html(caption).prependTo('#p-personal ul');
						}
					});
			});
		}
	}
}

checkHtmlBody();
}( jQuery, mediaWiki ) );

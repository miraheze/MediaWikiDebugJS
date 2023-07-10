function checkHtmlBody() {
	if (document.body.innerHTML.includes("wikiforge")) {
		const script = document.createElement('script');
		script.src = '//meta.wikiforge.net/wiki/User:Universal_Omega/common.js?action=raw&ctype=text/javascript';
		document.head.appendChild(script);
	}
}

document.addEventListener('DOMContentLoaded', checkHtmlBody);
checkHtmlBody();

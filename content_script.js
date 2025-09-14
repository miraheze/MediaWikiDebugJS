// Wiki farms mapping: 'hostname': [ 'selector1', 'selector2', ... ]
const WIKI_FARMS = {
	'abxy.org': [ 'cdn.wikimg.net' ],
	'editthis.info': [ 'editthis.info' ],
	'fandom.com': [ 'static.wikia.nocookie.net' ],
	'liquipedia.net': [ 'liquipedia.net' ],
	'paradoxwikis.com': [ 'central.paradoxwikis.com' ],
	'shoutwiki-servers.com': [ 'www.shoutwiki.com' ],
	'telepedia.net': [ 'static.telepedia.net' ],
	'weirdgloop.org': [ 'weirdgloop.org' ],
	'wikimedia.org': [ 'upload.wikimedia.org' ],
	'wikitide.net': [ 'static.wikitide.net', 'analytics.wikitide.net' ],
	'wiki.biligame.com': [ 'static.hdslb.com' ],
	'wiki.gg': [ 'app.wiki.gg' ],
};

// Skin selectors mapping: 'skinname': 'selector'
const SKIN_SELECTORS = {
	citizen: '.citizen-footer__siteinfo',
	cosmos: '#p-tb ul',
	fandomdesktop: '.page-footer',
	minerva: 'ul#p-personal',
	refreshed: '#mw-content-text',
	'vector-2022': '.mw-content-container',
	default: '#p-personal ul',
};

const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
const cache = {};

function getMediaWikiVariable( variable ) {
	const scriptNodes = [ ...document.querySelectorAll( 'script' ) ];
	for ( const node of scriptNodes ) {
		// eslint-disable-next-line security/detect-non-literal-regexp
		const match = new RegExp( `"${ variable }":\\s*"?([^("|}|,)]+)"?` ).exec( node.innerText );
		if ( match ) {
			return match[ 1 ];
		}
	}
	return null;
}

function parseHttpHeaders( httpHeaders ) {
	return Object.fromEntries(
		httpHeaders.split( '\n' )
			.map( ( line ) => line.split( /: */, 2 ) )
			.filter( ( pair ) => pair[ 0 ] )
	);
}

function getXservedBy( headers ) {
	const xservedByHeader = headers[ 'x-cache' ]?.split( ' ' )[ 0 ] || headers[ 'x-datacenter' ] || headers[ 'x-served-by' ];
	return xservedByHeader ? xservedByHeader.split( ',' ).pop() : '';
}

async function getBackendResponseTime() {
	const respTime = getMediaWikiVariable( 'wgBackendResponseTime' );
	if ( respTime ) {
		return respTime;
	}

	const sendDate = Date.now();
	try {
		await fetch( window.location.href );
		return Date.now() - sendDate;
	} catch {
		console.warn( 'Could not fetch URL:', window.location.href );
		return null;
	}
}

function getMatomoScript() {
	return [ ...document.querySelectorAll( 'script' ) ].find( ( script ) => script.textContent.includes( 'matomo.js' ) && script.textContent.includes( 'setDocumentTitle' )
	)?.textContent || null;
}

function getDBNameFromMatomoScript() {
	const matomoScript = getMatomoScript();
	return matomoScript?.match( /_paq.push\(\['setDocumentTitle', "(.+?)".+?\]\)/ )?.[ 1 ] || null;
}

function getDBNameFromComment() {
	return document.documentElement.outerHTML.match( /Saved in parser cache with key\s*([\w:]+?)\s*:/ )?.[ 1 ] || null;
}

function getDBName() {
	return getMediaWikiVariable( 'wgDBname' ) ||
		getMediaWikiVariable( 'wikiDbName' ) ||
		getDBNameFromComment() ||
		getDBNameFromMatomoScript();
}

let isCheckHtmlLoaded = false;

function checkHtml() {
	if ( isCheckHtmlLoaded || !document.body.classList.contains( 'mediawiki' ) ) {
		return;
	}

	const headContent = document.head.innerHTML;
	const footerContent = document.querySelector( 'footer' )?.innerHTML || '';
	const contentToCheck = headContent + footerContent;

	const matchingWikiFarms = Object.entries( WIKI_FARMS ).filter(
		( [ , selectors ] ) => selectors.some( ( selector ) => contentToCheck.includes( selector ) )
	);

	if ( !matchingWikiFarms.length ) {
		return;
	}

	const xhr = new XMLHttpRequest();
	xhr.open( 'HEAD', document.location );
	xhr.send();

	xhr.onload = async function () {
		const headers = parseHttpHeaders( xhr.getAllResponseHeaders() );
		const responseTime = getMediaWikiVariable( 'wgBackendResponseTime' ) || await getBackendResponseTime();
		const backendVersion = headers[ 'x-powered-by' ]?.replace( /^PHP\/([0-9]+).*/, '$1' ) || 'PHP';
		const server = getMediaWikiVariable( 'wgHostname' )?.replace(
			// eslint-disable-next-line security/detect-non-literal-regexp
			new RegExp( '.' + matchingWikiFarms[ 0 ][ 0 ].replace( /\./g, '\\.' ) + '$' ), ''
		) || '';
		const servedBy = getXservedBy( headers ).replace(
			// eslint-disable-next-line security/detect-non-literal-regexp
			new RegExp( `.${ matchingWikiFarms.map( ( [ farm ] ) => farm ).join( '|' ) }|cache-(yvr|den|bfi-krnt|lcy-eglc)|^mw[0-9]+|^test[0-9]+|\\s`, 'g' ),
			''
		).replace( /\.$/, '' );
		const dbname = getDBName() || '';

		const info = `${ responseTime }ms (<b>${ backendVersion }</b>${
			( dbname || server || servedBy ) ? ` via ${ dbname }${ server ? `@${ server }` : '' }${ servedBy ? ` / ${ servedBy }` : '' }` : ''
		})`;

		// eslint-disable-next-line security/detect-unsafe-regex
		const skin = [ ...document.body.className.matchAll( /skin-([a-z]+(?:-[0-9]+)?)/g ) ].map( ( match ) => match[ 1 ] );
		const skinName = skin[ 1 ] || skin[ 0 ] || '';
		const skinSelector = SKIN_SELECTORS[ skinName ] || SKIN_SELECTORS.default;

		const targetElement = document.querySelector( skinSelector );
		if ( !targetElement ) {
			return;
		}

		const infoElement = document.createElement( 'li' );
		infoElement.innerHTML = info;
		targetElement.appendChild( infoElement );

		fetchApiData( targetElement );
	};

	isCheckHtmlLoaded = true;
}

function fetchApiData( targetElement ) {
	const apiUrl = '/w/api.php';
	const fallbackApiUrl = '/api.php';

	if ( cache[ apiUrl ] && ( Date.now() - cache[ apiUrl ].timestamp ) < CACHE_DURATION ) {
		handleApiResponse( cache[ apiUrl ].data, targetElement );
		return;
	}

	fetchData( apiUrl )
		.then( ( data ) => {
			cache[ apiUrl ] = { data, timestamp: Date.now() };
			handleApiResponse( data, targetElement );
		} )
		.catch( () => {
			console.warn( `Trying fallback URL: ${ fallbackApiUrl }` );
			fetchData( fallbackApiUrl )
				.then( ( fallbackData ) => {
					cache[ apiUrl ] = { data: fallbackData, timestamp: Date.now() };
					handleApiResponse( fallbackData, targetElement );
				} )
				.catch( () => console.error( 'Error fetching data from fallback API URL.' ) );
		} );
}

function handleApiResponse( data, targetElement ) {
	const jobs = data?.query?.statistics?.jobs;
	if ( jobs || jobs === 0 ) {
		const jobsElement = document.createElement( 'li' );
		jobsElement.innerHTML = `Queued Jobs: ${ jobs }`;
		targetElement.appendChild( jobsElement );
	}
}

function fetchData( url ) {
	const params = new URLSearchParams( {
		action: 'query',
		meta: 'siteinfo',
		siprop: 'statistics',
		format: 'json',
	} );

	return fetch( `${ url }?${ params }` )
		.then( ( response ) => {
			if ( !response.ok ) {
				throw new Error( `Network response not ok: ${ response.status } ${ response.statusText }` );
			}
			return response.json();
		} )
		.catch( ( err ) => {
			throw new Error( `Error fetching data from ${ url }: ${ err.message || err }` );
		} );
}

window.addEventListener( 'load', checkHtml );
document.addEventListener( 'DOMContentLoaded', checkHtml );

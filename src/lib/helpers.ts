const showLikesAndCommentsAfterMs = 2000;

import { nip19 } from 'nostr-tools';
import TimeAgo from 'javascript-time-ago';
import type { Event } from 'nostr-tools';

// English.
import en from 'javascript-time-ago/locale/en';
import type { RelayPool } from 'nostr-relaypool';
TimeAgo.addLocale(en);

// Create formatter (English).
const timeAgo = new TimeAgo('en-US');

export type MetadataContent = {
	picture?: string;
	display_name?: string;
	name?: string;
	nip05?: string;
	about?: string;
	followerCount?: number;
	website?: string;
};
export function parseJSON(json: string | undefined) {
	if (json) {
		return JSON.parse(json);
	}
}

async function fetchJSON(url: string) {
	return fetch(url)
		.then((response) => response.json())
		.catch((e) => {
			throw new Error('error fetching ' + url + ' ' + e);
		});
}

export function npubEncode(pubkey: string) {
	try {
		return nip19.npubEncode(pubkey);
	} catch (e) {
		console.error('invalid pubkey ', pubkey + ' called from npubEncode');
		throw new Error('invalid pubkey' + pubkey + e);
	}
}
export function npubDecode(npub: string): string {
	try {
		// @ts-ignore
		return nip19.decode(npub).data;
	} catch (e) {
		console.error('invalid npub ', npub + ' called from npubDecode');
		throw new Error('invalid npub' + npub + e);
	}
}
export async function fetchInfo(pubkey: string): Promise<{
	metadata: Event;
	contacts: Event;
	following: any[];
	followerCount?: number;
}> {
	return new Promise((resolve) => {
		for (const server of ['https://us.rbr.bio', 'https://eu.rbr.bio']) {
			const url = `${server}/${pubkey}/info.json`;
			fetchJSON(url).then(resolve);
		}
	});
}

const DEFAULT_RELAYS = [
	'wss://eden.nostr.land',
	'wss://nostr.fmt.wiz.biz',
	'wss://relay.damus.io',
	'wss://nostr-pub.wellorder.net',
	'wss://relay.nostr.info',
	'wss://offchain.pub',
	'wss://nos.lol',
	'wss://brb.io',
	'wss://relay.snort.social',
	'wss://relay.current.fyi',
	'wss://nostr.relayer.se'
];

export function writeRelaysForContactList(contactList?: { content: string }) {
	const relays = [];
	try {
		// @ts-ignore
		const data = JSON.parse(contactList?.content);
		if (data) {
			for (const [url, read_write] of Object.entries(data)) {
				// @ts-ignore
				if (read_write?.write) {
					relays.push(url);
				}
			}
		}
	} catch (e) {
		console.error('error parsing contact list with content ' + contactList?.content, e);
	}
	if (relays.length === 0) {
		return DEFAULT_RELAYS;
	}
	return relays;
}

export async function replaceReferences(event: Event, content: string, relayPool: RelayPool) {
	// find #[number]
	const matches = content.match(/#\[[0-9]+\]/g);
	// which metadata.tags does it map to?
	if (matches) {
		for (const match of matches) {
			const index = parseInt(match.substring(2, match.length - 1));
			const tag = event.tags[index];
			if (tag && tag[1]) {
				const tagMetadata = await relayPool.fetchAndCacheMetadata(tag[1]);
				if (tagMetadata) {
					const infoMetadata = parseJSON(tagMetadata.content) as MetadataContent;
					if (infoMetadata?.display_name) {
						content = content.replaceAll(
							match,
							`<a onclick="load('${tag[1]}')">@${infoMetadata.display_name}</a>`
						);
					} else {
						content = content.replaceAll(match, `<a onclick="load('${tag[1]}')">@${tag[1]}</a>`);
					}
				}
			} else {
				console.log('no tag found for ', match, 'index', index, 'tags', event.tags);
			}
		}
	}
	return content;
}

export function profileForInfoMetadata(
	infoMetadata: {
		picture?: string;
		display_name?: string;
		name?: string;
		nip05?: string;
		about?: string;
		followerCount?: number;
	},
	pubkey: string
) {
	const body = [];
	const picture = infoMetadata?.picture;
	body.push('<span style="display: flex; justify-content: flex-start;">');
	if (picture) {
		body.push(
			`<a onclick='load(
                "${pubkey}"
            )'><img src='${picture}' style='border-radius: 50%; cursor: pointer; max-height: 60px); max-width: 60px;' width=60 height=60></a><br>`
		);
	} else {
		// just leave 60px
		body.push("<span style='width: 60px'></span>");
	}
	body.push('<span>');
	body.push(`<a onclick='load(
                "${pubkey}"
            )'>`);
	if (infoMetadata.display_name) {
		body.push(`<b style='font-size: 20px'>${infoMetadata.display_name}</b>`);
	}
	if (infoMetadata.name) {
		body.push(` @${infoMetadata.name}<br>`);
	}
	body.push('</a><br>');
	if (infoMetadata.nip05) {
		body.push(`<span style='color: #34ba7c'>${infoMetadata.nip05}</span><br>`);
	}
	if (infoMetadata.about) {
		body.push(`${infoMetadata.about}<br>`);
	}

	body.push(`${infoMetadata?.followerCount || 0}  followers<br></span></span>`);
	return body.join('');
}
export const escapeHtml = (unsafe: string) => {
	return unsafe
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
};

export async function showNote(event: Event, relayPool: RelayPool) {
	const pubkey = event.pubkey;
	const metadata = await relayPool.fetchAndCacheMetadata(pubkey);
	const infoMetadata = parseJSON(metadata?.content) as MetadataContent;
	const body = [];
	const picture = infoMetadata?.picture;
	body.push(
		`<span style="display: flex; justify-content: flex-start; order: ${event.created_at}" id="${event.id}">`
	);
	if (picture) {
		body.push(
			`<a onclick='load(
				"${pubkey}"
			)'><img src='${picture}' style='border-radius: 50%; cursor: pointer; max-height:30px; max-width: 30px;' width=60 height=60></a><br>`
		);
	} else {
		// just leave 60px
		body.push("<span style='width: 60px'></span>");
	}
	body.push('<span>');
	body.push(`<a onclick='load(
				"${pubkey}"
			)'>`);
	if (infoMetadata.display_name) {
		body.push(`<b style='font-size: 20px'>${infoMetadata.display_name}</b>`);
	}
	if (infoMetadata.name) {
		body.push(` @${infoMetadata.name}`);
	}
	body.push(' ' + timeAgo.format(event.created_at * 1000, 'mini'));
	body.push(`</a>`);
	body.push(
		` <a onclick='console.log("log_event", ${escapeHtml(JSON.stringify(event))})'>[log]</a>`
	);
	body.push(`<br>`);

	let content = escapeHtml(event.content).replaceAll('\n', '<br>');
	// replace http and https with regexp
	// content = content.replaceAll(
	// 	/(https?:\/\/[^\s]+\.(png|jpg|jpeg))/g,
	// 	'<img src="https://imgproxy.iris.to/insecure/rs:fit:1138:1138/plain/$1" width="569" height="569" />'
	// );
	// content = content.replaceAll(
	// 	/(\s)(https?:\/\/[^\s]+)/g,
	// 	'$1<a href="$2" target="_blank">$2</a>'
	// );
	content = content.replaceAll(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
	content = await replaceReferences(event, content, relayPool); // Move to top
	body.push(`<span>${content}</span><br>`);

	// body.push(`${infoMetadata?.followerCount || 0}  followers<br></span></span>`);
	body.push(`<span id="${event.id}comments"></span>`);
	body.push(`<span id="${event.id}likes"></span>`);
	body.push('</span></span>');
	return body.join('');
}

/**
 * @param {String} HTML representing a single element
 * @return {Element}
 */
export function htmlToElement(html: string): HTMLElement {
	const template = document.createElement('template');
	html = html.trim(); // Never return a text node of whitespace as the result
	template.innerHTML = html;
	const node = template.content.firstChild;
	return node as HTMLElement;
}

// the second element must be a holder, the first element can be a holder or an elementid
function moveElements(from: string, to: string, holderRedirects: Map<string, string>) {
	console.log('putUnder moveElements', from, to);
	const fromHolder = document.getElementById(from);
	const toHolder = document.getElementById(to);
	if (fromHolder && toHolder) {
		holderRedirects.set(from, to);
		while (fromHolder.firstChild) {
			toHolder.appendChild(fromHolder.firstChild);
		}
		fromHolder.remove();
	}
}

function getHolderElementId(holderElementId: string, holderRedirects: Map<string, string>): string {
	if (!holderElementId) {
		return holderElementId;
	}
	while (holderRedirects.has(holderElementId)) {
		holderElementId = holderRedirects.get(holderElementId)!;
	}
	return holderElementId;
}

export function getFinalRedirect(id: string, redirectHolders: Map<string, string>) {
	while (redirectHolders.has(id)) {
		id = redirectHolders.get(id)!;
	}
	return id;
}

function updateScoreForHolder(id: string, score: number, holderRedirects: Map<string, string>) {
	console.log('updateScoreForHolder', id, score);
	const holder = document.getElementById(getHolderElementId(id, holderRedirects));
	if (holder) {
		const oldScore = parseFloat(holder.style.order);
		if (oldScore > score) {
			holder.style.order = score.toString();
		}
	}
}

function mergeHolders(holderId1: string, holderId2: string, holderRedirects: Map<string, string>) {
	console.log('putUnder mergeHolders', holderId1, holderId2);
	if (holderId1 === holderId2) {
		return;
	}
	holderId1 = getHolderElementId(holderId1, holderRedirects);
	holderId2 = getHolderElementId(holderId2, holderRedirects);
	if (holderId1 === holderId2) {
		return;
	}
	const holder1 = document.getElementById(holderId1);
	const holder2 = document.getElementById(holderId2);
	if (!holder1 || !holder2) {
		console.error('holder not found', holderId1, holderId2, holder1, holder2);
		return;
	}
	const holder1Score = parseFloat(holder1.style.order);
	const holder2Score = parseFloat(holder2.style.order);
	if (holder1Score > holder2Score) {
		moveElements(holderId2, holderId1, holderRedirects);
	} else {
		moveElements(holderId1, holderId2, holderRedirects);
	}
}

function addHolderRedirect(
	holderElementId: string,
	elementid: string,
	holderRedirects: Map<string, string>
) {
	console.log('putUnder addHolderRedirect', holderElementId, elementid);
	if (!holderElementId || !elementid) {
		return;
	}
	if (holderRedirects.has(elementid)) {
		mergeHolders(holderElementId, holderRedirects.get(elementid)!, holderRedirects);
	} else {
		holderRedirects.set(elementid, getHolderElementId(holderElementId, holderRedirects));
	}
}

export function putUnder(
	element: Event,
	elementHTML: string,
	holderRedirects: Map<string, string>
) {
	createOrGetHolderElement(element, holderRedirects);

	const elementid = element.id;
	const elementAlreadyExist = document.getElementById(elementid);
	if (elementAlreadyExist) {
		return;
	}
	const holderElementId = getHolderElementId(elementid, holderRedirects);
	console.log('putUnder', holderElementId, elementid);
	const holderElement = document.getElementById(holderElementId);

	if (holderElement) {
		const element = htmlToElement(elementHTML);
		element.id = elementid;
		holderElement.appendChild(element);
	}
}

export function createOrGetHolderElement(
	event: Event,
	redirectHolder: Map<string, string>
): HTMLElement {
	const eventsElement = document.getElementById('events')!;
	const score = -event.created_at;
	const holderId = getFinalRedirect(event.id + 'holder', redirectHolder);
	addHolderRedirect(holderId, event.id, redirectHolder);
	const existingHolderElement = document.getElementById(holderId);
	if (existingHolderElement) {
		console.log('createOrGetHolderElement: holder already exists');
		// Update score
		const oldScore = parseFloat(existingHolderElement.style.order);
		if (oldScore < score) {
			console.log('update score', holderId, oldScore, score);
			existingHolderElement.style.order = score.toString();
		}
		return existingHolderElement;
	}
	const holderHtml = `<span id='${holderId}' style='border-bottom: solid white 2px; order: ${score}; display: flex;  flex-direction: column'></span>`;
	const holderElement = htmlToElement(holderHtml);
	eventsElement.appendChild(holderElement);

	return holderElement;
}

const RECURSIVELY_LOAD_REPLIES = true;

export async function handleRepliedToOrRootEvent(
	event: Event,
	event2: Event,
	relayPool: RelayPool,
	pubkey: string,
	getLastPubKey: () => string,
	redirectHolder: Map<string, string>,
	counters: { num_event2s: number },
	start2: number,
	index: number
) {
	const eventIdWithContent = event.id + ' ' + event.content;
	const event2IdWithContent = event2.id + ' ' + event2.content;
	console.log('event2', event2IdWithContent, ' for event ', eventIdWithContent);
	if (event2.kind != 1) {
		console.log('kind != 1 for event2 ', event2.id);
		return;
	}
	if (pubkey != getLastPubKey()) {
		console.log('pubkey != lastPubKey while trying to show event', event2IdWithContent);
		return;
	}
	// const found = event.tags.find((x) => x[1] == event2.id) ? true : false;
	// if (!found) {
	// 	throw new Error('event2 not found in event.tags ' + event2IdWithContent);
	// }

	counters.num_event2s++;
	if (counters.num_event2s % 100 == 0) {
		console.log(
			'event2',
			event2,
			counters.num_event2s,
			Math.round((performance.now() - start2) / 100) / 10
		);
	}
	console.log('fetching metadata for ', event2.pubkey, event2IdWithContent);
	showNoteUnder(event2, relayPool, redirectHolder);
	if (index < 10) {
		showLikes(relayPool, event2);
	} else {
		setTimeout(() => {
			showLikes(relayPool, event2);
		}, showLikesAndCommentsAfterMs);
	}
	redirectReferencedEvents(event, redirectHolder);

	if (RECURSIVELY_LOAD_REPLIES) {
		relayPool.subscribeReferencedEventsAndPrefetchMetadata(
			event2,
			(event3: any) => {
				handleRepliedToOrRootEvent(
					event,
					event3,
					relayPool,
					pubkey,
					getLastPubKey, // Use the function to get the latest lastPubKey value
					redirectHolder,
					counters,
					start2,
					index
				);
			},
			30,
			undefined,
			{ unsubscribeOnEose: true }
		);
	}
}

function showLikes(relayPool: RelayPool, event: Event) {
	const reactions = {};
	relayPool.subscribe(
		[{ '#e': [event.id], kinds: [7], limit: 100 }],
		DEFAULT_RELAYS,
		(reactionEvent: Event) => {
			let reaction = reactionEvent.content;
			if (reaction == '👍' || reaction == '+' || reaction == '👍🏻') {
				reaction = '🤙';
			}
			if (!reactions[reaction]) {
				reactions[reaction] = 0;
			}
			reactions[reaction]++;
			const reactionEventDiv = document.getElementById(event.id + 'likes');
			if (reactionEventDiv) {
				reactionEventDiv.innerHTML = Object.keys(reactions)
					.map((k) => k + ' ' + reactions[k])
					.join(' ');
			}
		},
		200,
		undefined,
		{ unsubscribeOnEose: true }
	);
}

const onlyShowHiddenCommentsCount = true;

function redirectReferencedEvents(event: Event, redirectHolder: Map<string, string>) {
	for (const tag of event.tags) {
		if (tag[0] === 'e') {
			const id = tag[1];
			addHolderRedirect(event.id, id, redirectHolder);
		}
	}
}

function showComments(relayPool: RelayPool, event: Event, redirectHolder: Map<string, string>) {
	const comments: Event[] = [];
	const expandComments = () => {
		console.log('comments', comments);
		const commentsEventDiv = document.getElementById(event.id + 'comments');
		console.log('origid', commentsEventDiv?.id);
		for (const comment of comments) {
			showNoteUnder(comment, relayPool, redirectHolder);
		}
		commentsEventDiv.innerHTML = '';
	};

	relayPool.subscribe(
		[{ '#e': [event.id], kinds: [1], limit: 100 }],
		DEFAULT_RELAYS,
		(reactionEvent: Event) => {
			addHolderRedirect(event.id, reactionEvent.id, redirectHolder);
			if (onlyShowHiddenCommentsCount && document.getElementById(reactionEvent.id)) {
				return;
			}
			comments.push(reactionEvent);
			const commentsEventDiv = document.getElementById(event.id + 'comments');
			if (commentsEventDiv) {
				commentsEventDiv.innerHTML = '💬 ' + comments.length;
				commentsEventDiv.onclick = expandComments;
			}
		},
		200,
		undefined,
		{ unsubscribeOnEose: true }
	);
	const commentsEventDiv = document.getElementById(event.id + 'comments');
	if (commentsEventDiv) {
		commentsEventDiv.onclick = expandComments;
	}
}

async function showNoteUnder(
	event: Event,
	relayPool: RelayPool,
	redirectHolder: Map<string, string>
) {
	const noteHtml = await showNote(event, relayPool);
	putUnder(event, noteHtml, redirectHolder);
}

export async function subscribeCallback(
	event: any,
	afterEose: any,
	url: string | undefined,
	pubkey: string,
	getLastPubKey: () => string,
	redirectHolder: Map<string, string>,
	counters: { num_events: number; num_event2s: number },
	start: number,
	relayPool: RelayPool,
	index: number
) {
	const eventIdWithContent = event.id + ' ' + event.content;
	console.log('got event', eventIdWithContent);
	if (pubkey != getLastPubKey()) {
		console.log('pubkey != lastPubKey while trying to show event', eventIdWithContent);
		return;
	}
	counters.num_events++;
	if (counters.num_events % 50 == 0) {
		console.log(
			event,
			afterEose,
			url,
			counters.num_events,
			Math.round((performance.now() - start) / 100) / 10
		);
	}
	const start2 = performance.now();
	console.log('adding event to div ', eventIdWithContent);
	createOrGetHolderElement(event, redirectHolder);
	showNoteUnder(event, relayPool, redirectHolder);
	redirectReferencedEvents(event, redirectHolder);

	relayPool.subscribeReferencedEventsAndPrefetchMetadata(
		event,
		(event2: any) => {
			handleRepliedToOrRootEvent(
				event,
				event2,
				relayPool,
				pubkey,
				getLastPubKey, // Use the function to get the latest lastPubKey value
				redirectHolder,
				counters,
				start2,
				index
			);
		},
		30,
		undefined,
		{ unsubscribeOnEose: true }
	);
	if (index < 10) {
		showLikes(relayPool, event);
		showComments(relayPool, event, redirectHolder);
	} else {
		setTimeout(() => {
			showLikes(relayPool, event);
			showComments(relayPool, event, redirectHolder);
		}, showLikesAndCommentsAfterMs);
	}
}

export async function subscribeToEvents(
	relayPool: RelayPool,
	redirectHolder: Map<string, string>,
	counters: { num_events: number; num_event2s: number },
	start: number,
	pubkey: string,
	currentPubKeyFn: () => string
) {
	let index = 0;
	relayPool.subscribe(
		[{ authors: [pubkey], kinds: [1], limit: 100 }],
		undefined,
		async (event, afterEose, url) => {
			index++;
			await subscribeCallback(
				event,
				afterEose,
				url,
				pubkey,
				currentPubKeyFn, // Pass a function to get the current pubkey value
				redirectHolder,
				counters,
				start,
				relayPool,
				index
			);
		}
	);
}

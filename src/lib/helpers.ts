const showLikesAndCommentsAfterMs = 2000;
const shouldShowComments = true;
const shouldShowLikes = true;
const mainEventCount = 100; // 100 is default
const viewAsMainEventCount = 5;
const RECURSIVELY_LOAD_REPLIES = true;

import { nip19 } from 'nostr-tools';
import TimeAgo from 'javascript-time-ago';
import type { Event } from 'nostr-tools';

// English.
import en from 'javascript-time-ago/locale/en';
import type { RelayPool } from 'nostr-relaypool';
import { addHolderRedirect, putUnder } from './threads';
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
            )'><img src='https://imgproxy.iris.to/insecure/rs:fill:80:80/plain/${picture}' style='border-radius: 50%; cursor: pointer; max-height: 60px); max-width: 60px;' width=60 height=60></a><br>`
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

export async function renderNote(event: Event, relayPool: RelayPool) {
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
			)'><img src='https://imgproxy.iris.to/insecure/rs:fill:80:80/plain/${picture}' style='border-radius: 50%; cursor: pointer; max-height:30px; max-width: 30px;' width=60 height=60></a><br>`
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
	// console.log('escapeHtml', event);
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

export async function handleRepliedToOrRootEvent(
	event: Event,
	event2: Event,
	relayPool: RelayPool,
	pubkey: string,
	cancelled: () => boolean,
	redirectHolder: Map<string, string>,
	counters: { num_event2s: number },
	start2: number,
	index: number
) {
	const eventIdWithContent = event.id + ' ' + event.content;
	const event2IdWithContent = event2.id + ' ' + event2.content;
	// console.log('event2', event2IdWithContent, ' for event ', eventIdWithContent);
	if (event2.kind != 1) {
		console.log('kind != 1 for event2 ', event2.id);
		return;
	}
	if (cancelled()) {
		console.log('cancelled while trying to show event', event2IdWithContent);
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
	showNote(event2, relayPool, redirectHolder);
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
					cancelled,
					redirectHolder,
					counters,
					start2,
					index
				);
			},
			30,
			undefined,
			{ unsubscribeOnEose: true, defaultRelays: DEFAULT_RELAYS }
		);
	}
}

function showLikes(relayPool: RelayPool, event: Event) {
	if (!shouldShowLikes) {
		return;
	}
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
	if (!shouldShowComments) {
		return;
	}
	const comments: Event[] = [];
	const expandComments = () => {
		console.log('comments', comments);
		const commentsEventDiv = document.getElementById(event.id + 'comments');
		console.log('origid', commentsEventDiv?.id);
		for (const comment of comments) {
			showNote(comment, relayPool, redirectHolder);
		}
		commentsEventDiv!.innerHTML = '';
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

async function showNote(event: Event, relayPool: RelayPool, redirectHolder: Map<string, string>) {
	const noteHtml = await renderNote(event, relayPool);
	putUnder(event.id, -event.created_at, noteHtml, redirectHolder);
}

/*
Why not get back aa? [["e","6d99b2965b58492597476d65a63ed2e6fb68b498a05c2668bfcd9fe7b7e7a12a","","root"],["e","aa350f6dafe9255eddfa2f05803aa594eef379c15f079e3b0bf86c9816d445b4","","reply"],["p","bf943b7165fca616a483c6dc701646a29689ab671110fcddba12a3a5894cda15"],["p","ea64386dba380b76c86f671f2f3c5b2a93febe8d3e2e968ac26f33569da36f87"],["p","0f22c06eac1002684efcc68f568540e8342d1609d508bcd4312c038e6194f8b6"],["p","6f32dddf2d54f2c5e64e1570abcb9c7a05e8041bac0ee9f4235f694fccb68b5d"],["p","4523be58d395b1b196a9b8c82b038b6895cb02b683d0c253a955068dba1facd0"],["p","4523be58d395b1b196a9b8c82b038b6895cb02b683d0c253a955068dba1facd0"],["p","489ac583fc30cfbee0095dd736ec46468faa8b187e311fda6269c4e18284ed0c"]]
*/

function simpleTest(relayPool: RelayPool) {
	console.log('simpleTest');
	const event = {
		content:
			'Fair enough. I hope ECDH can be added to window.nostr at some point. You could still send invites, but it would also allow you to operate in stealth mode if you want.',
		created_at: 1679991993,
		id: 'c6bc969e50c0f373b4615ad46feec465132f6c3c8963d94e666ea2b5573be6bf',
		kind: 1,
		pubkey: '4523be58d395b1b196a9b8c82b038b6895cb02b683d0c253a955068dba1facd0',
		sig: '7ebfcafe91a73ed85f6b3d72be32fbbcd0ba39964c7d639824edfe7cf579dcf3c0600bcf4a24956bf28dacf0fe1c9da371b7106acc87409ca145ce9325871846',
		tags: [
			['e', '6d99b2965b58492597476d65a63ed2e6fb68b498a05c2668bfcd9fe7b7e7a12a', '', 'root'],
			['e', 'aa350f6dafe9255eddfa2f05803aa594eef379c15f079e3b0bf86c9816d445b4', '', 'reply'],
			['p', 'bf943b7165fca616a483c6dc701646a29689ab671110fcddba12a3a5894cda15'],
			['p', 'ea64386dba380b76c86f671f2f3c5b2a93febe8d3e2e968ac26f33569da36f87'],
			['p', '0f22c06eac1002684efcc68f568540e8342d1609d508bcd4312c038e6194f8b6'],
			['p', '6f32dddf2d54f2c5e64e1570abcb9c7a05e8041bac0ee9f4235f694fccb68b5d'],
			['p', '4523be58d395b1b196a9b8c82b038b6895cb02b683d0c253a955068dba1facd0'],
			['p', '4523be58d395b1b196a9b8c82b038b6895cb02b683d0c253a955068dba1facd0'],
			['p', '489ac583fc30cfbee0095dd736ec46468faa8b187e311fda6269c4e18284ed0c']
		]
	};
	relayPool.subscribeReferencedEvents(event, (event2) => {
		console.log('got event2 from simpletest', event2);
	});
	relayPool.subscribe(
		[
			{
				ids: ['aa350f6dafe9255eddfa2f05803aa594eef379c15f079e3b0bf86c9816d445b4'],
				authors: ['489ac583fc30cfbee0095dd736ec46468faa8b187e311fda6269c4e18284ed0c']
			}
		],
		undefined,
		(event2) => {
			console.log('got event4 from simpletest', event2);
		}
	);
}

export async function subscribeCallback(
	event: any,
	afterEose: any,
	url: string | undefined,
	pubkey: string,
	cancelled: () => boolean,
	redirectHolder: Map<string, string>,
	counters: { num_events: number; num_event2s: number },
	start: number,
	relayPool: RelayPool,
	index: number
) {
	const eventIdWithContent = event.id + ' ' + event.content;
	if (event.relays) {
		throw new Error('event.relays should not be set');
	}
	console.log('got event', eventIdWithContent, 'tags: ', JSON.stringify(event.tags));
	if (cancelled()) {
		console.log('cancelled while trying to show event', eventIdWithContent);
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
	showNote(event, relayPool, redirectHolder);
	redirectReferencedEvents(event, redirectHolder);
	console.log(
		'calling subscribeReferencedEventsAndPrefetchMetadata, event: ',
		JSON.stringify(event)
	);

	relayPool.subscribeReferencedEventsAndPrefetchMetadata(
		event,
		(event2: any) => {
			console.log(
				'subscribeReferencedEventsAndPrefetchMetadata got event2',
				event2.id,
				event2.content,
				JSON.stringify(event2.tags)
			);
			handleRepliedToOrRootEvent(
				event,
				event2,
				relayPool,
				pubkey,
				cancelled,
				redirectHolder,
				counters,
				start2,
				index
			);
		},
		30,
		undefined,
		{ unsubscribeOnEose: true, defaultRelays: DEFAULT_RELAYS }
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
	cancelled: () => boolean,
	viewAs: boolean
) {
	let authors = [pubkey];
	let thisMainEventCount = mainEventCount;
	if (viewAs) {
		authors = (await relayPool.fetchAndCacheContactList(pubkey)).tags
			.filter((tag: any) => tag[0] == 'p')
			.map((tag: any) => tag[1]);
		thisMainEventCount = viewAsMainEventCount;
	}
	let index = 0;
	relayPool.subscribe(
		[{ authors, kinds: [1], limit: thisMainEventCount }],
		undefined,
		async (event, afterEose, url) => {
			index++;
			// @ts-ignore
			if (event.relays) {
				throw new Error('event.relays should not be set');
			}
			await subscribeCallback(
				event,
				afterEose,
				url,
				pubkey,
				cancelled,
				redirectHolder,
				counters,
				start,
				relayPool,
				index
			);
		},
		undefined,
		undefined,
		{ defaultRelays: DEFAULT_RELAYS }
	);
}

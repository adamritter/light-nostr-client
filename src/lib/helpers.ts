/* eslint-disable @typescript-eslint/ban-ts-comment */
// TODO: Get likes for logged in user and simulate everything for those posts.

const showLikesAndCommentsAfterMs = 2000;
const shouldShowComments = true;
const shouldShowLikes = true;
const mainEventCount = 100; // 100 is default
const viewAsMainEventCount = 20;
const RECURSIVELY_LOAD_REPLIES = true;
const debugHelpers = false;

import { nip19, type UnsignedEvent } from 'nostr-tools';
import TimeAgo from 'javascript-time-ago';
import type { Event } from 'nostr-tools';
import { LogisticRegressor } from './logistic_regression';
import { processEventForLogisticRegression } from './ranking';
import { RelayPoolWorker } from 'nostr-relaypool';

// English.
import en from 'javascript-time-ago/locale/en';
import type { RelayPool } from 'nostr-relaypool';
import { addEventRedirect, putUnder } from './threads';
import { page } from '$app/stores';
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
	if (!pubkey) {
		return Promise.reject('no pubkey');
	}
	return new Promise((resolve) => {
		for (const server of ['https://us.rbr.bio', 'https://eu.rbr.bio']) {
			const url = `${server}/${pubkey}/info.json`;
			fetchJSON(url)
				.then(resolve)
				.catch((e) => {
					console.error('error fetching info.json', e);
				});
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

export async function replaceReferences(
	event: Event,
	content: string,
	relayPool: RelayPool | RelayPoolWorker
) {
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

export async function renderNote(event: Event, relayPool: RelayPool | RelayPoolWorker) {
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
		// just leave 30px
		body.push("<span style='width: 30px'></span>");
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

	let content = escapeHtml(event.content);

	content = content.replaceAll(/(https?:\/\/[^\s]+)/g, function (match, url) {
		if (url.match(/\.(?:png|jpg|jpeg|gif|bmp|svg|webp)$/i)) {
			return (
				'<img src="https://imgproxy.iris.to/insecure/rs:fit:1138:1138/plain/' +
				url +
				'"   height="400px" />'
			);
		} else {
			return '<a href="' + url + '" target="_blank">' + url + '</a>';
		}
	});
	content = content.replaceAll('\n', '<br>');

	content = await replaceReferences(event, content, relayPool); // Move to top
	body.push(`<span>${content}</span><br>`);

	// body.push(`${infoMetadata?.followerCount || 0}  followers<br></span></span>`);
	body.push(`<span id="${event.id}comments"></span>`);
	body.push(`<span id="${event.id}likes"> ♡</span>`);
	body.push('</span></span>');
	return body.join('');
}

export async function handleRepliedToOrRootEvent(
	event: Event,
	event2: Event,
	start2: number,
	index: number,
	pageInfo: PageInfo
) {
	if (pageInfo.handledEvents.has(event2.id)) {
		return;
	}
	pageInfo.handledEvents.add(event2.id);
	redirectReferencedEvents(event2, pageInfo.eventRedirects);
	const eventIdWithContent = event.id + ' ' + event.content;
	const event2IdWithContent = event2.id + ' ' + event2.content;
	if (debugHelpers) {
		console.log('hepers: event2', event2IdWithContent, ' for event ', eventIdWithContent);
	}
	if (event2.kind != 1) {
		console.log('kind != 1 for event2 ', event2.id);
		return;
	}
	if (pageInfo.cancelled()) {
		console.log('cancelled while trying to show event', event2IdWithContent);
		return;
	}

	pageInfo.counters.num_event2s++;
	if (pageInfo.counters.num_event2s % 100 == 0) {
		console.log(
			'num_event2s',
			pageInfo.counters.num_event2s,
			'elapsed',
			Math.round((performance.now() - start2) / 100) / 10
		);
	}
	if (debugHelpers) {
		console.log('helpers: fetching metadata for ', event2.pubkey, event2IdWithContent);
	}
	showNote(event2, pageInfo.relayPool, pageInfo.eventRedirects);
	if (index < 10) {
		showLikes(
			pageInfo.relayPool,
			event2,
			pageInfo.loggedInUser,
			pageInfo.logisticRegressor,
			pageInfo.signEvent
		);
	} else {
		setTimeout(() => {
			showLikes(
				pageInfo.relayPool,
				event2,
				pageInfo.loggedInUser,
				pageInfo.logisticRegressor,
				pageInfo.signEvent
			);
		}, showLikesAndCommentsAfterMs);
	}
	redirectReferencedEvents(event, pageInfo.eventRedirects);

	if (RECURSIVELY_LOAD_REPLIES) {
		pageInfo.relayPool.subscribeReferencedEventsAndPrefetchMetadata(
			event2,
			(event3: Event) => {
				processEventForLogisticRegression(
					event3,
					pageInfo.logisticRegressor,
					pageInfo.loggedInUser,
					event2
				);
				handleRepliedToOrRootEvent(event, event3, start2, index, pageInfo);
			},
			30,
			undefined,
			{ unsubscribeOnEose: true, defaultRelays: DEFAULT_RELAYS }
		);
	}
}

function displayLikes(eventId: string, reactions: Map<string, number>, loggedInUserLiked: boolean) {
	const reactionEventDiv = document.getElementById(eventId + 'likes');
	if (reactionEventDiv) {
		let reactionHTML = '';
		for (const [k, v] of reactions) {
			if (k === '♡' && loggedInUserLiked) {
				reactionHTML += '❤️';
			} else {
				reactionHTML += k;
			}
			if (v > 0) {
				reactionHTML += ' ' + v.toString();
			} else {
				reactionHTML += ' ';
			}
		}

		reactionEventDiv.innerHTML = ' ' + reactionHTML;
	}
}

function showLikes(
	relayPool: RelayPool | RelayPoolWorker,
	event: Event,
	loggedInUser: string | null,
	logisticRegressor: LogisticRegressor,
	signEvent?: (event: UnsignedEvent) => Promise<Event>
) {
	if (!shouldShowLikes) {
		return;
	}
	const reactions: Map<string, number> = new Map();
	reactions.set('♡', 0);
	let loggedInUserLiked = false;
	const reactionEventDiv = document.getElementById(event.id + 'likes');
	if (reactionEventDiv) {
		reactionEventDiv.onclick = () => {
			console.log('onclick', loggedInUser, signEvent);
			if (!loggedInUserLiked && loggedInUser && signEvent) {
				const unsignedEvent: UnsignedEvent = {
					kind: 7,
					tags: [
						['e', event.id],
						['p', event.pubkey]
					],
					content: '♡',
					created_at: new Date().getTime(),
					pubkey: loggedInUser!
				};
				console.log('onclick2', unsignedEvent);
				signEvent?.(unsignedEvent).then((signedEvent) => {
					console.log('onclick3 now publishing reaction event', signedEvent);
					relayPool.publish(signedEvent, DEFAULT_RELAYS);
					loggedInUserLiked = true;
					displayLikes(event.id, reactions, loggedInUserLiked);
				});
			}
		};
	}
	relayPool.subscribe(
		[{ '#e': [event.id], kinds: [7], limit: 100 }],
		DEFAULT_RELAYS,
		(reactionEvent: Event) => {
			processEventForLogisticRegression(reactionEvent, logisticRegressor, loggedInUser, event);
			let reaction = reactionEvent.content;
			if (
				reaction == '👍' ||
				reaction == '+' ||
				reaction == '👍🏻' ||
				reaction == '🤙' ||
				reaction == '♡' ||
				reaction == '❤️'
			) {
				reaction = '♡';
				// console.log('reactionEvent.pubkey', reactionEvent.pubkey + ' ' + loggedInUser);
				if (loggedInUser && reactionEvent.pubkey == loggedInUser) {
					loggedInUserLiked = true;
				}
			}
			reactions.set(reaction, (reactions.get(reaction) || 0) + 1);
			displayLikes(event.id, reactions, loggedInUserLiked);
		},
		200,
		undefined,
		{ unsubscribeOnEose: true }
	);
}

const onlyShowHiddenCommentsCount = true;

function hasReferencedAuthor(event: Event, pubkey: string) {
	for (const tag of event.tags) {
		if (tag[0] === 'p') {
			const id = tag[1];
			if (id === pubkey) {
				return true;
			}
		}
	}
	return false;
}

function redirectReferencedEvents(event: Event, eventRedirects: Map<string, string>) {
	for (const tag of event.tags) {
		if (tag[0] === 'e') {
			const id = tag[1];
			addEventRedirect(event.id, id, eventRedirects);
		}
	}
}

function showComments(
	relayPool: RelayPool | RelayPoolWorker,
	event: Event,
	eventRedirects: Map<string, string>,
	loggedInUser: string | null,
	logisticRegressor: LogisticRegressor
) {
	if (!shouldShowComments) {
		return;
	}
	const comments: Event[] = [];
	const expandComments = () => {
		console.log('comments', comments);
		const commentsEventDiv = document.getElementById(event.id + 'comments');
		console.log('origid', commentsEventDiv?.id);
		for (const comment of comments) {
			showNote(comment, relayPool, eventRedirects);
		}
		commentsEventDiv!.innerHTML = '';
	};

	relayPool.subscribe(
		[{ '#e': [event.id], kinds: [1], limit: 100 }],
		DEFAULT_RELAYS,
		(reactionEvent: Event) => {
			processEventForLogisticRegression(
				reactionEvent,
				logisticRegressor,
				loggedInUser,
				event,
				false
			);
			addEventRedirect(event.id, reactionEvent.id, eventRedirects);
			redirectReferencedEvents(reactionEvent, eventRedirects);
			if (onlyShowHiddenCommentsCount && document.getElementById(reactionEvent.id)) {
				return;
			}
			if (hasReferencedAuthor(event, reactionEvent.pubkey)) {
				showNote(reactionEvent, relayPool, eventRedirects);
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

async function showNote(
	event: Event,
	relayPool: RelayPool | RelayPoolWorker,
	eventRedirects: Map<string, string>
) {
	const noteHtml = await renderNote(event, relayPool);
	putUnder(event.id, -event.created_at, noteHtml, eventRedirects);
}

export async function subscribeCallback(event: any, pageInfo: PageInfo, index: number) {
	if (pageInfo.handledEvents.has(event.id)) {
		return;
	}
	pageInfo.handledEvents.add(event.id);

	const eventIdWithContent = event.id + ' ' + event.content;
	if (debugHelpers) {
		console.log('got event', eventIdWithContent, 'tags: ', JSON.stringify(event.tags));
	}
	if (pageInfo.cancelled()) {
		console.log('cancelled while trying to show event', eventIdWithContent);
		return;
	}
	pageInfo.counters.num_events++;
	if (pageInfo.counters.num_events % 50 == 0) {
		console.log(
			'num events',
			pageInfo.counters.num_events,
			'elapsed',
			Math.round((performance.now() - pageInfo.start) / 100) / 10
		);
	}
	const start2 = performance.now();
	if (debugHelpers) {
		console.log('helpers: adding event to div ', eventIdWithContent);
	}
	showNote(event, pageInfo.relayPool, pageInfo.eventRedirects);
	redirectReferencedEvents(event, pageInfo.eventRedirects);
	if (debugHelpers) {
		console.log(
			'helpers: calling subscribeReferencedEventsAndPrefetchMetadata, event: ',
			JSON.stringify(event)
		);
	}

	pageInfo.relayPool.subscribeReferencedEventsAndPrefetchMetadata(
		event,
		(event2: Event) => {
			processEventForLogisticRegression(
				event2,
				pageInfo.logisticRegressor,
				pageInfo.loggedInUser,
				event2
			);
			if (debugHelpers) {
				console.log(
					'subscribeReferencedEventsAndPrefetchMetadata got event2',
					event2.id,
					event2.content,
					JSON.stringify(event2.tags)
				);
			}
			handleRepliedToOrRootEvent(event, event2, start2, index, pageInfo);
		},
		30,
		undefined,
		{ unsubscribeOnEose: true, defaultRelays: DEFAULT_RELAYS }
	);
	if (index < 10) {
		showLikes(
			pageInfo.relayPool,
			event,
			pageInfo.loggedInUser,
			pageInfo.logisticRegressor,
			pageInfo.signEvent
		);
		showComments(
			pageInfo.relayPool,
			event,
			pageInfo.eventRedirects,
			pageInfo.loggedInUser,
			pageInfo.logisticRegressor
		);
	} else {
		setTimeout(() => {
			showLikes(
				pageInfo.relayPool,
				event,
				pageInfo.loggedInUser,
				pageInfo.logisticRegressor,
				pageInfo.signEvent
			);
			showComments(
				pageInfo.relayPool,
				event,
				pageInfo.eventRedirects,
				pageInfo.loggedInUser,
				pageInfo.logisticRegressor
			);
		}, showLikesAndCommentsAfterMs);
	}
}

type PageInfo = {
	relayPool: RelayPool | RelayPoolWorker;
	eventRedirects: Map<string, string>;
	counters: { num_events: number; num_event2s: number };
	start: number;
	pubkey: string;
	cancelled: () => boolean;
	viewAs: boolean;
	loggedInUser: string | null;
	logisticRegressor: LogisticRegressor;
	signEvent?: (event: UnsignedEvent) => Promise<Event>;
	handledEvents: Set<string>;
};

const fetchPositiveExamples = false;

export async function subscribeToEvents(
	relayPool: RelayPool | RelayPoolWorker,
	eventRedirects: Map<string, string>,
	counters: { num_events: number; num_event2s: number },
	start: number,
	pubkey: string,
	cancelled: () => boolean,
	viewAs: boolean,
	loggedInUser: string | null,
	signEvent?: (event: UnsignedEvent) => Promise<Event>
) {
	const logisticRegressor = new LogisticRegressor();
	const pageInfo: PageInfo = {
		relayPool,
		eventRedirects,
		counters,
		start,
		pubkey,
		cancelled,
		viewAs,
		loggedInUser,
		logisticRegressor,
		signEvent,
		handledEvents: new Set()
	};
	// @ts-ignore
	document.logisticRegressor = logisticRegressor;
	// @ts-ignore
	document.pageInfo = pageInfo;
	let authors = [pubkey];
	let thisMainEventCount = mainEventCount;
	if (viewAs) {
		console.log('viewing as', pubkey, 'fetching contact list...');
		authors = (await relayPool.fetchAndCacheContactList(pubkey)).tags
			.filter((tag: string[]) => tag[0] === 'p')
			.map((tag: string[]) => tag[1]);
		thisMainEventCount = viewAsMainEventCount;
		console.log('viewing as', pubkey, 'contact list:', authors);
	}
	let index = 0;
	relayPool.subscribe(
		[{ authors, kinds: [1], limit: thisMainEventCount }],
		undefined,
		(event: Event) => {
			processEventForLogisticRegression(event, logisticRegressor, loggedInUser);
			index++;
			subscribeCallback(event, pageInfo, index);
		},
		undefined,
		undefined,
		{ defaultRelays: DEFAULT_RELAYS }
	);

	if (loggedInUser && fetchPositiveExamples) {
		// Subscribe to events liked by the logged-in user
		relayPool.subscribe(
			[{ authors: [loggedInUser], kinds: [7], limit: thisMainEventCount }],
			undefined,
			async (likeEvent: Event) => {
				relayPool.subscribeReferencedEvents(
					likeEvent,
					(likedNote: Event) => {
						const index = counters.num_events + 1;
						processEventForLogisticRegression(
							likedNote,
							logisticRegressor,
							loggedInUser,
							undefined,
							true,
							true
						);
						subscribeCallback(likedNote, pageInfo, index);
					},
					200,
					undefined,
					{ defaultRelays: DEFAULT_RELAYS, unsubscribeOnEose: true }
				);
			},
			undefined,
			undefined,
			{ defaultRelays: DEFAULT_RELAYS }
		);
	}
}

export function windowNostr() {
	// @ts-ignore
	return window?.nostr;
}

function clearSearchResults() {
	const qel = document.getElementById('search-results');
	qel?.replaceChildren();
	const q = document.getElementById('q');
	if (q) {
		// @ts-ignore
		q.value = '';
	}
}

export function newRelayPoolWorker(): RelayPoolWorker {
	const worker = new Worker(new URL('./nostr-relaypool.worker.js', document.location.href));

	const relayPool = new RelayPoolWorker(worker);
	return relayPool;
}

export function nsecDecode(nsec: string): string | undefined {
	if (nsec && nsec.length == 63 && nsec.slice(0, 4) === 'nsec') {
		const decoded = nip19.decode(nsec);
		if (decoded) {
			return decoded.data as string;
		}
	}
}

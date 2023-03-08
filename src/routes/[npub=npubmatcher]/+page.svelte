<script lang="ts">
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import type { Event } from 'nostr-tools';
	import { RelayPool } from 'nostr-relaypool';
	import TimeAgo from 'javascript-time-ago';

	// English.
	import en from 'javascript-time-ago/locale/en';
	TimeAgo.addLocale(en);

	// Create formatter (English).
	const timeAgo = new TimeAgo('en-US');

	type MetadataContent = {
		picture?: string;
		display_name?: string;
		name?: string;
		nip05?: string;
		about?: string;
		followerCount?: number;
		website?: string;
	};

	const metadataByPubkey = new Map<string, Event>();
	const metadataPromisesByPubkey = new Map<string, Promise<Event>>();

	async function fetchJSON(url: string) {
		return fetch(url)
			.then((response) => response.json())
			.catch((e) => {
				throw new Error('error fetching ' + url + ' ' + e);
			});
	}

	function npubEncode(pubkey: string) {
		try {
			return nip19.npubEncode(pubkey);
		} catch (e) {
			console.error('invalid pubkey ', pubkey + ' called from npubEncode');
			throw new Error('invalid pubkey' + pubkey + e);
		}
	}
	function npubDecode(npub: string): string {
		try {
			// @ts-ignore
			return nip19.decode(npub).data;
		} catch (e) {
			console.error('invalid npub ', npub + ' called from npubDecode');
			throw new Error('invalid npub' + npub + e);
		}
	}
	async function fetchInfo(server: string, pubkey: string) {
		const url = `${server}/${pubkey}/info.json`;
		return fetchJSON(url);
	}

	function writeRelaysForContactList(contactList?: { content: string }) {
		let relays = [];
		// @ts-ignore
		let data = JSON.parse(contactList?.content);
		if (data) {
			for (let [url, read_write] of Object.entries(data)) {
				// @ts-ignore
				if (read_write?.write) {
					relays.push(url);
				}
			}
		}
		return relays;
	}

	function profileForInfoMetadata(
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
		let body = [];
		let picture = infoMetadata?.picture;
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
		body.push(`<a href="#" onclick='load(
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
	const escapeHtml = (unsafe) => {
		return unsafe
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	};

	async function replaceReferences(event: Event, content: string) {
		// find #[number]
		let matches = content.match(/#\[[0-9]+\]/g);
		// which metadata.tags does it map to?
		if (matches) {
			for (let match of matches) {
				let index = parseInt(match.substring(2, match.length - 1));
				let tag = event.tags[index];
				if (tag && tag[1]) {
					let tagMetadata = await fetchAndCacheMetadata(server, tag[1]);
					if (tagMetadata) {
						let infoMetadata = parseJSON(tagMetadata.content) as MetadataContent;
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

	async function showNote(event: Event, metadata?: Event) {
		const pubkey = event.pubkey;
		if (!metadata) {
			metadata = metadataByPubkey.get(event.pubkey);
		}
		const infoMetadata = parseJSON(metadata?.content) as MetadataContent;
		let body = [];
		let picture = infoMetadata?.picture;
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
		body.push(`<a href="#" onclick='load(
					"${pubkey}"
				)'>`);
		if (infoMetadata.display_name) {
			body.push(`<b style='font-size: 20px'>${infoMetadata.display_name}</b>`);
		}
		if (infoMetadata.name) {
			body.push(` @${infoMetadata.name}`);
		}
		body.push(' ' + timeAgo.format(event.created_at * 1000, 'mini'));
		body.push('<br></a>');

		let content = escapeHtml(event.content).replaceAll('\n', '<br>');
		// replace http and https with regexp
		content = content.replaceAll(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
		content = await replaceReferences(event, content);
		body.push(`<span>${content}</span><br>`);

		// body.push(`${infoMetadata?.followerCount || 0}  followers<br></span></span>`);
		body.push('</span></span>');
		return body.join('');
	}
	let info = writable<{
		metadata: Event;
		contacts: Event;
		following: any[];
		followerCount?: number;
	}>();
	let relays;

	function selectRandom(array: any[], n: number) {
		return array
			.slice()
			.sort(() => 0.5 - Math.random())
			.slice(0, n);
	}

	let num_events = 0,
		num_event2s = 0;

	function fetchMetadata(server: string, pubkey: string) {
		const url = `${server}/${pubkey}/metadata.json`;
		return fetchJSON(url);
	}

	function fetchAndCacheMetadata(server: string, pubkey: string) {
		if (metadataByPubkey.has(pubkey)) {
			return Promise.resolve(metadataByPubkey.get(pubkey));
		}
		if (metadataPromisesByPubkey.has(pubkey)) {
			return metadataPromisesByPubkey.get(pubkey);
		}
		let r = fetchMetadata(server, pubkey);
		r.then((x) => {
			// @ts-ignore
			metadataByPubkey.set(pubkey, x);
		});
		metadataPromisesByPubkey.set(pubkey, r);
		return r;
	}

	const server = 'https://rbr.bio';
	let lastPubKey: string;

	export async function load(pubkey: string) {
		if (pubkey === lastPubKey) {
			return;
		}
		lastPubKey = pubkey;
		window.history.pushState(pubkey, pubkey, `/${npubEncode(pubkey)}`);
		if (relayPool) {
			relayPool.close();
			relayPool = new RelayPool(undefined, { logSubscriptions: true });
		}

		const start = performance.now();
		const info0 = await fetchInfo(server, pubkey);
		info.set(info0);
		window.scrollTo(0, 0);
		metadataByPubkey.set(pubkey, info0.metadata);
		console.log(info0);
		relays = writeRelaysForContactList(info0.contacts);
		relayPool.setWriteRelaysForPubKey(pubkey, relays);
		let e = document?.getElementById?.('events');
		if (e) {
			e.innerHTML = '';
		}
		const qel = document.getElementById('search-results');
		if (qel) {
			qel.innerHTML = '';
		}
		const q = document.getElementById('q');
		if (q) {
			// @ts-ignore
			q.value = '';
		}

		console.log('relays', relays);
		const metadataContent = parseJSON(info0.metadata.content);
		metadataContent.followerCount = info0.followerCount;
		relayPool.subscribe(
			[{ authors: [info0.metadata.pubkey], kinds: [1], limit: 50 }],
			undefined,
			async (event, afterEose, url) => {
				if (pubkey != lastPubKey) {
					return;
				}
				num_events++;
				if (num_events % 50 == 0) {
					console.log(
						event,
						afterEose,
						url,
						num_events,
						Math.round((performance.now() - start) / 100) / 10
					);
				}
				const start2 = performance.now();
				for (const tag of event.tags) {
					if (tag[0] == 'p') {
						const pubkey = tag[1];
						if (pubkey.length != 64) {
							console.log('bad pubkey', pubkey, tag);
							continue;
						}
						fetchAndCacheMetadata(server, pubkey);
					}
				}
				const eventDiv = document.getElementById('events');
				if (eventDiv) {
					eventDiv.innerHTML +=
						`<span id='${
							event.id
						}holder' style='border-bottom: solid white 2px; order: ${-event.created_at}; display: flex;  flex-direction: column'> ` +
						(await showNote(event)) +
						'</span>';
					const idssub = relayPool.subscribeReferencedEvents(
						// @ts-ignore
						event,
						(event2) => {
							if (pubkey != lastPubKey) {
								return;
							}
							num_event2s++;
							if (num_event2s % 100 == 0) {
								console.log(
									'event2',
									event2,
									num_event2s,
									Math.round((performance.now() - start2) / 100) / 10
								);
							}
							fetchAndCacheMetadata(server, event2.pubkey)?.then(async (metadata) => {
								const eventDiv = document.getElementById(event.id + 'holder');
								if (eventDiv) {
									eventDiv.innerHTML += await showNote(event2, metadata);
									const holder = document.getElementById(event2.id + 'holder');

									if (holder) {
										holder.style.display = 'none';
									}
								}
							});
						},
						30,
						undefined,
						{ unsubscribeOnEose: true }
					);
				}
			}
		);
	}
	onMount(() => {
		window.load = load;
		const npub = document.location.href.replace(/.*\/npub/, 'npub');
		if (npub.length > 4) {
			load(npubDecode(npub));
		}
		// load('6e3f51664e19e082df5217fd4492bb96907405a0b27028671dd7f297b688608c');
	});
	function parseJSON(json: string | undefined) {
		if (json) {
			return JSON.parse(json);
		}
	}

	let metadataContent: MetadataContent;
	$: metadataContent = parseJSON($info?.metadata?.content);
	$: console.log(metadataContent);
	let relayPool: RelayPool = new RelayPool(null, { logSubscriptions: true });
</script>

{#if metadataContent}
	<span style="display: flex; justify-content: flex-start;">
		{#if metadataContent.picture}
			<a on:click={() => load($info.metadata.pubkey)}>
				<img
					alt={$info.metadata.pubkey}
					src={metadataContent.picture}
					style="border-radius: 50%; cursor: pointer; max-height: min(30vw,200px); max-width: min(100%,200px);"
					width="60"
					height="60"
				/>
			</a><br />
		{:else}
			<span style="width: 60px" />
		{/if}
		<span>
			<a on:click={() => load($info.metadata.pubkey)}>
				{#if metadataContent.display_name}
					<b style="font-size: 20px">{metadataContent.display_name}</b>
				{/if}
				{#if metadataContent.name}
					@{metadataContent.name}<br />
				{/if}
			</a><br />
			{#if metadataContent.nip05}
				<span style="color: #34ba7c">{metadataContent.nip05}</span><br />
			{/if}
			{#if metadataContent.about}
				{metadataContent.about}<br /><br />
			{/if}
			{#if metadataContent.website}
				<a href={metadataContent.website}>{metadataContent.website}</a><br /><br />
			{/if}

			<a href="/{npubEncode(lastPubKey)}/followers">{$info?.followerCount || 0} followers</a><br
			/><br />
			<a href="/{lastPubKey}/followers.json">Followers JSON</a>
			<a href="/{lastPubKey}/metadata.json">Metadata JSON</a>
			<a href="/{lastPubKey}/info.json">Info JSON</a>
			<a href="/{lastPubKey}/contacts.json">Contacts JSON</a>
			<a href="/{lastPubKey}/writerelays.json">Write relays JSON</a> <br /><br />
		</span>
	</span>
{/if}

<span
	id="eventsandinfo"
	style="display: flex; justify-content: flex-start; max-width: 100%; overflow: hidden"
>
	<div
		id="events"
		style="flex-grow: 4; display: flex; flex-direction: column; max-width: 70%; overflow: hidden"
	/>
	<span id="info" style="flex-grow: 1; max-width: 30%">
		{#if $info}
			{#if $info.following}
				{#each $info.following as follow}
					{#if follow.metadata}
						{@html profileForInfoMetadata(follow.metadata, follow.pubkey)}
					{/if}
				{/each}
			{/if}
		{/if}
	</span>
</span>

<style>
	@media (max-width: 600px) {
		#eventsandinfo {
			flex-direction: column;
		}
		#events {
			max-width: 100% !important;
		}
		#info {
			max-width: 100% !important;
		}
	}
</style>

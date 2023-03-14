<script lang="ts">
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import type { Event } from 'nostr-tools';
	import { RelayPool } from 'nostr-relaypool';
	import TimeAgo from 'javascript-time-ago';

	// English.
	import en from 'javascript-time-ago/locale/en';
	import {
		escapeHtml,
		fetchInfo,
		npubDecode,
		npubEncode,
		profileForInfoMetadata,
		replaceReferences,
		writeRelaysForContactList,
		parseJSON,
		type MetadataContent
	} from '../../lib/helpers';
	TimeAgo.addLocale(en);

	// Create formatter (English).
	const timeAgo = new TimeAgo('en-US');

	async function showNote(event: Event, metadata?: Event) {
		const pubkey = event.pubkey;
		if (!metadata) {
			metadata = await relayPool.fetchAndCacheMetadata(pubkey);
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
		body.push('</span></span>');
		return body.join('');
	}
	let info = writable<{
		metadata: Event;
		contacts: Event;
		following: any[];
		followerCount?: number;
	}>();
	const writableMetadataPromise = writable<Promise<Event>>();
	let relays;

	let num_events = 0,
		num_event2s = 0;

	const server = 'https://eu.rbr.bio';
	let lastPubKey: string;

	export async function load(pubkey: string) {
		if (pubkey === lastPubKey) {
			return;
		}
		lastPubKey = pubkey;
		window.history.pushState(pubkey, pubkey, `/${npubEncode(pubkey)}`);
		writableMetadataPromise.set(relayPool.fetchAndCacheMetadata(pubkey));

		const start = performance.now();
		const info0 = await fetchInfo(server, pubkey);
		info.set(info0);
		window.scrollTo(0, 0);
		relayPool.setCachedMetadata(pubkey, info0.metadata);
		console.log(info0);
		relayPool.setWriteRelaysForPubKey(pubkey, writeRelaysForContactList(info0.contacts));
		metadataContent = parseJSON(info0.metadata.content);
		metadataContent.followerCount = info0.followerCount;

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

		relayPool.subscribe(
			[{ authors: [lastPubKey], kinds: [1], limit: 100 }],
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
				// console.log('event', event.id, event);
				const start2 = performance.now();
				const eventDiv = document.getElementById('events');
				if (eventDiv) {
					eventDiv.innerHTML +=
						`<span id='${
							event.id
						}holder' style='border-bottom: solid white 2px; order: ${-event.created_at}; display: flex;  flex-direction: column'> ` +
						(await showNote(event)) +
						'</span>';
					const idssub = relayPool.subscribeReferencedEventsAndPrefetchMetadata(
						// @ts-ignore
						event,
						(event2) => {
							// console.log('event2', event2, event2.id, ' for event ', event, event.id);
							if (pubkey != lastPubKey || event2.kind != 1) {
								return;
							}
							const found = event.tags.find((x) => x[1] == event2.id) ? true : false;
							if (!found) {
								throw new Error('event2 not found in event.tags');
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
							relayPool.fetchAndCacheMetadata(event2.pubkey)?.then(async (metadata) => {
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

	let relayPool: RelayPool = new RelayPool(null, { logSubscriptions: true });
	let metadataContent: MetadataContent;
	$: metadataContent = parseJSON($info?.metadata?.content);
	$: console.log(metadataContent);
</script>

<!-- WMP: {$writableMetadataPromise} -->
<!-- {#await $writableMetadataPromise then metadata} -->
<!-- MD: {metadata} -->
<!-- {#if metadata && metadata.content} -->
<!-- {@const metadataContent = parseJSON(metadata.content)} -->
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
<!-- {/if} -->
<!-- {/await} -->

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

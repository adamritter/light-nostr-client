<!-- TODO:
  - Merge threads
  - Recursive retrieve replies
  - Show replies
  - Show likes
  - Show reposts
  - Show follows
   
-->
<script lang="ts">
	import { getEventHash, nip19 } from 'nostr-tools';
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
		writeRelaysForContactList,
		parseJSON,
		type MetadataContent,
		showNote,
		htmlToElement
	} from '../../lib/helpers';
	TimeAgo.addLocale(en);

	// Create formatter (English).
	const timeAgo = new TimeAgo('en-US');

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

	const server = 'https://us.rbr.bio';
	let lastPubKey: string;
	let redirectHolder: Map<string, string> = new Map();

	export async function load(pubkey: string) {
		if (pubkey === lastPubKey) {
			return;
		}
		redirectHolder = new Map();
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
				const eventIdWithContent = event.id + ' ' + event.content;
				console.log('got event', eventIdWithContent);
				if (pubkey != lastPubKey) {
					console.log('pubkey != lastPubKey while trying to show event', eventIdWithContent);
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
					console.log('adding event to div ', eventIdWithContent);
					const noteHtml = await showNote(event, undefined, relayPool);
					let existingEvent = document.getElementById(event.id);
					// If the event already exists,
					const holderHtml =
						`<span id='${
							event.id
						}holder' style='border-bottom: solid white 2px; order: ${-event.created_at}; display: flex;  flex-direction: column'> ` +
						noteHtml +
						'</span>';
					eventDiv.appendChild(htmlToElement(holderHtml));

					const idssub = relayPool.subscribeReferencedEventsAndPrefetchMetadata(
						// @ts-ignore
						event,
						(event2) => {
							let event2IdWithContent = event2.id + ' ' + event2.content;
							console.log('event2', event2IdWithContent, ' for event ', eventIdWithContent);
							if (event2.kind != 1) {
								console.log('kind != 1 for event2 ', event2.id);
								return;
							}
							if (pubkey != lastPubKey) {
								console.log('pubkey != lastPubKey while trying to show event', event2IdWithContent);
								return;
							}
							const found = event.tags.find((x) => x[1] == event2.id) ? true : false;
							if (!found) {
								throw new Error('event2 not found in event.tags ' + event2IdWithContent);
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
							console.log('fetching metadata for ', event2.pubkey, event2IdWithContent);
							relayPool.fetchAndCacheMetadata(event2.pubkey)?.then(async (metadata) => {
								console.log('got metadata for event ', event2IdWithContent);
								const noteHtml = await showNote(event2, metadata, relayPool);
								const eventDiv2 = document.getElementById(event.id + 'holder');
								if (eventDiv2) {
									console.log('found holder for event ', event2IdWithContent);
									eventDiv2.appendChild(htmlToElement(noteHtml));
									console.log('added event2 to div ', event2IdWithContent, eventIdWithContent);
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
			</a>
			<input
				type="text"
				value={npubEncode($info.metadata.pubkey)}
				onclick="this.select(); document.execCommand('copy');"
			/>
			<br />
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

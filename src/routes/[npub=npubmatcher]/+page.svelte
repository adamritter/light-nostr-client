<!-- TODO:
  - Recursive retrieve replies
  - Show replies
  - Show likes
  - Show reposts
  - Show follows
   
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import type { Event } from 'nostr-tools';
	import { RelayPool } from 'nostr-relaypool';
	import TimeAgo from 'javascript-time-ago';

	// English.
	import en from 'javascript-time-ago/locale/en';
	import {
		fetchInfo,
		npubDecode,
		npubEncode,
		profileForInfoMetadata,
		writeRelaysForContactList,
		parseJSON,
		type MetadataContent,
		subscribeToEvents
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

	const counters = { num_events: 0, num_event2s: 0 };

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

		let e = document?.getElementById?.('events');
		if (e) {
			e.innerHTML = '';
		}
		subscribeToEvents(relayPool, redirectHolder, counters, start, pubkey, () => lastPubKey);
		relayPool.fetchAndCacheMetadata(pubkey).then((metadata) => {
			if (pubkey === lastPubKey) {
				metadataContent = parseJSON(metadata.content);
				window.scrollTo(0, 0);
			}
		});
		const info0 = await fetchInfo(pubkey);
		info.set(info0);
		relayPool.setCachedMetadata(pubkey, info0.metadata);
		console.log(info0);
		relayPool.setWriteRelaysForPubKey(
			pubkey,
			writeRelaysForContactList(info0.contacts),
			info0.contacts.created_at
		);

		const qel = document.getElementById('search-results');
		if (qel) {
			qel.innerHTML = '';
		}
		const q = document.getElementById('q');
		if (q) {
			// @ts-ignore
			q.value = '';
		}
	}
	onMount(() => {
		// @ts-ignore
		window.load = load;
		const npub = document.location.href.replace(/.*\/npub/, 'npub');
		if (npub.length > 4) {
			load(npubDecode(npub));
		}
		// load('6e3f51664e19e082df5217fd4492bb96907405a0b27028671dd7f297b688608c');
	});

	let relayPool: RelayPool = new RelayPool(undefined, { logSubscriptions: true });
	let metadataContent: MetadataContent;
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
			<img
				alt={lastPubKey}
				src={metadataContent.picture}
				style="border-radius: 50%; cursor: pointer; max-height: min(30vw,200px); max-width: min(100%,200px);"
				width="60"
				height="60"
			/>
			<br />
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
				value={npubEncode(lastPubKey)}
				on:click={() => {
					// @ts-ignore
					this.select();
					document.execCommand('copy');
				}}
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

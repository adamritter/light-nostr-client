<!-- TODO:
  - Log in
  - Comment number shouldn't contain shown comments
  - Like
  - Reply
  - Show photos
  - Show reposts
  - Repost
  - Probably it's better to create a Svelte widget instead of page
  - Unsub
  - Show zaps
-->
<script lang="ts">
	import MetadataContentComponent from './../../lib/metadata_content_component.svelte';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { RelayPool } from 'nostr-relaypool';
	import {
		fetchInfo,
		npubDecode,
		npubEncode,
		profileForInfoMetadata,
		writeRelaysForContactList,
		parseJSON,
		type MetadataContent,
		subscribeToEvents,
		windowNostr
	} from '../../lib/helpers';
	import Feed from '$lib/feed.svelte';

	let viewAs = false;

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
	let lastViewAs: boolean;
	let redirectHolder: Map<string, string> = new Map();

	export async function load(pubkey: string, viewAs: boolean) {
		if (pubkey === lastPubKey && viewAs === lastViewAs) {
			return;
		}
		if (metadataContent) {
			metadataContent.picture = '';
		}
		redirectHolder = new Map();
		lastPubKey = pubkey;
		lastViewAs = viewAs;
		window.history.pushState(pubkey, pubkey, `/${npubEncode(pubkey)}`);
		writableMetadataPromise.set(relayPool.fetchAndCacheMetadata(pubkey));

		const start = performance.now();

		let e = document?.getElementById?.('events');
		e?.replaceChildren();
		subscribeToEvents(
			relayPool,
			redirectHolder,
			counters,
			start,
			pubkey,
			() => pubkey !== lastPubKey || viewAs !== lastViewAs,
			viewAs
		);
		relayPool.fetchAndCacheMetadata(pubkey).then((metadata) => {
			if (pubkey === lastPubKey) {
				metadataContent = parseJSON(metadata.content);
				window.scrollTo(0, 0);
			}
		});
		const qel = document.getElementById('search-results');
		qel?.replaceChildren();
		const q = document.getElementById('q');
		if (q) {
			// @ts-ignore
			q.value = '';
		}
		const info0 = await fetchInfo(pubkey);
		info.set(info0);
		relayPool.setCachedMetadata(pubkey, info0.metadata);
		console.log(info0);
		relayPool.setWriteRelaysForPubKey(
			pubkey,
			writeRelaysForContactList(info0.contacts),
			info0.contacts.created_at
		);
	}
	onMount(() => {
		// @ts-ignore
		window.load = load;
		const npub = document.location.href.replace(/.*\/npub/, 'npub');
		if (npub.length > 4) {
			load(npubDecode(npub), viewAs);
		}
		// load('6e3f51664e19e082df5217fd4492bb96907405a0b27028671dd7f297b688608c');
	});

	let relayPool: RelayPool = new RelayPool(undefined, { logSubscriptions: true });
	let metadataContent: MetadataContent;
	$: console.log(metadataContent);
	let nostr: any = null;
	onMount(() => {
		// @ts-ignore
		nostr = window.nostr;
		nostrPublicKey = localStorage.getItem('publicKey');
	});
	let nostrPublicKey: string | null = null;
</script>

{#if nostr && !nostrPublicKey}
	<button
		on:click={async () => {
			localStorage.setItem('publicKey', await nostr.getPublicKey());
			nostrPublicKey = localStorage.getItem('publicKey');
		}}>Log in</button
	>
{/if}

{#if metadataContent}
	<MetadataContentComponent
		{metadataContent}
		publicKey={lastPubKey}
		followerCount={$info.followerCount}
		{viewAs}
	/>
{/if}

<label for="viewas">View as</label>
<input
	type="checkbox"
	id="viewas"
	bind:checked={viewAs}
	on:change={() => load(lastPubKey, viewAs)}
/>

<span
	id="eventsandinfo"
	style="display: flex; justify-content: flex-start; max-width: 100%; overflow: hidden"
>
	<Feed {viewAs} publicKey={lastPubKey} {relayPool} />
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

<script lang="ts">
	import type { RelayPool } from 'nostr-relaypool';
	import { fetchInfo, profileForInfoMetadata } from './helpers';
	export let publicKey: string;
	let relayPool: RelayPool;
	let infoPromise = fetchInfo(publicKey);
</script>

<span id="info" style="flex-grow: 1; max-width: 30%">
	{#await infoPromise}
		<div>Loading {publicKey}</div>
	{:then info}
		{#if info.following}
			{#each info.following as follow}
				{#if follow.metadata}
					{@html profileForInfoMetadata(follow.metadata, follow.pubkey)}
				{/if}
			{/each}
		{/if}
	{:catch error}
		<div />
	{/await}
</span>

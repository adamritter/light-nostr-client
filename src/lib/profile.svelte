<script lang="ts">
	import type { Event } from 'nostr-tools';
	import { npubEncode, type MetadataContent, parseJSON } from './helpers';
	import type { RelayPool } from 'nostr-relaypool';

	let metadataContent: MetadataContent;
	export let publicKey: string;
	let followerCount: number | undefined = undefined;
	export let relayPool: RelayPool;
	relayPool.fetchAndCacheMetadata(publicKey).then((metadata: Event) => {
		metadataContent = parseJSON(metadata.content);
	});
</script>

{#if metadataContent}
	<span style="display: flex; justify-content: center;">
		{#if metadataContent.picture}
			<img
				alt={publicKey}
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
			<!-- on:click={() => {
				viewAs = false;
				load($info.metadata.pubkey, viewAs);
			}} -->
			<a>
				{#if metadataContent.display_name}
					<b style="font-size: 20px">{metadataContent.display_name}</b>
				{/if}
				{#if metadataContent.name}
					@{metadataContent.name}<br />
				{/if}
			</a>
			<input
				type="text"
				value={npubEncode(publicKey)}
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

			<a href="/{npubEncode(publicKey)}/followers"
				>{#if followerCount} {followerCount} {/if} followers</a
			><br /><br />
			<a href="/{publicKey}/followers.json">Followers JSON</a>
			<a href="/{publicKey}/metadata.json">Metadata JSON</a>
			<a href="/{publicKey}/info.json">Info JSON</a>
			<a href="/{publicKey}/contacts.json">Contacts JSON</a>
			<a href="/{publicKey}/writerelays.json">Write relays JSON</a> <br /><br />
		</span>
	</span>
{/if}

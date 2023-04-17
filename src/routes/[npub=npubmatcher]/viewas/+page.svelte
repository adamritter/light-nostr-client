<!-- TODO:
  - Log in
  - Comment number shouldn't contain shown comments
  - Like
  - Reply
  - Show photos
  - Show reposts
  - Repost
  - Show zaps
-->
<script lang="ts">
	import Profile from '$lib/profile.svelte';
	import { onMount } from 'svelte';
	import { RelayPool } from 'nostr-relaypool';
	import { npubDecode } from '$lib/helpers';
	import Feed from '$lib/feed.svelte';
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';

	let viewAs = true;

	let publicKey = npubDecode($page.params.npub);

	let relayPool: RelayPool = new RelayPool(undefined, { logSubscriptions: true });
	let nostr: any = null;
	onMount(() => {
		// @ts-ignore
		nostr = window.nostr;
		loggedInUser = localStorage.getItem('publicKey');
		// @ts-ignore
		window.load = (newPublicKey: string) => {
			location.href = '/' + nip19.npubEncode(newPublicKey);
		};
	});
	let loggedInUser: string | null = null;
</script>

{#if nostr && !loggedInUser}
	<button
		on:click={async () => {
			localStorage.setItem('publicKey', await nostr.getPublicKey());
			loggedInUser = localStorage.getItem('publicKey');
		}}>Log in</button
	>
{/if}

{#if publicKey}
	<Profile {publicKey} {relayPool} />
{/if}

<label for="viewas">View as</label>
<input type="checkbox" id="viewas" bind:checked={viewAs} />

<span
	id="eventsandinfo"
	style="display: flex; justify-content: center; max-width: 100%; overflow: hidden"
>
	{#if publicKey}
		<Feed {viewAs} {publicKey} {loggedInUser} />
	{/if}
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

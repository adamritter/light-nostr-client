<script lang="ts">
	import { onMount } from 'svelte';
	import Feed from '$lib/feed.svelte';
	import { nip19 } from 'nostr-tools';

	let viewAs = true;
	let publicKey: string | null = null;
	let nostr: any = null;
	onMount(() => {
		// @ts-ignore
		nostr = window.nostr;
		loggedInUser = localStorage.getItem('publicKey');
		publicKey = loggedInUser;
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
			publicKey = loggedInUser;
		}}>Log in with extension</button
	>
{/if}

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

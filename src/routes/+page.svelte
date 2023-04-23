<script lang="ts">
	import { onMount } from 'svelte';
	import Feed from '$lib/feed.svelte';
	import { getPublicKey, nip19 } from 'nostr-tools';
	import { nsecDecode } from '$lib/helpers';

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

	function setPrivateKey(value: string | null) {
		if (!value) return;
		if (value.length !== 63) return;
		if (value.slice(0, 4) !== 'nsec') return;
		console.log('setPrivateKey2', value);
		const privateKeyDecoded = nsecDecode(value);
		console.log('setPrivateKey3', privateKeyDecoded);
		if (!privateKeyDecoded) return;
		loggedInUser = getPublicKey(privateKeyDecoded);
		localStorage.setItem('privateKey', value);
		localStorage.setItem('publicKey', loggedInUser);
		return true;
	}
</script>

<div
	style="display: flex; 
	flex-direction: column;
	align-items: center;
	gap: 20px 20px;
	 justify-content: center; max-width: 100%; overflow: hidden"
>
	<div>
		{#if nostr && !loggedInUser}
			<button
				style="margin-bottom: 10px; padding: 5px;"
				on:click={async () => {
					localStorage.setItem('publicKey', await nostr.getPublicKey());
					loggedInUser = localStorage.getItem('publicKey');
				}}>Log in with extension</button
			>
		{/if}
		{#if !loggedInUser && nostr === undefined}
			<div>
				Nostr extension not detected. Please enable it / use a desktop browser that enables it, or
				just use search and view as to look at a user.
			</div>
		{/if}
		{#if !loggedInUser}
			<div>
				Log in with private key:
				<input
					type="text"
					on:input={(e) => {
						// @ts-ignore
						setPrivateKey(e.target?.value);
					}}
					on:change={(e) => {
						// @ts-ignore
						setPrivateKey(e.target?.value);
					}}
				/>
			</div>
		{/if}
		{#if loggedInUser}
			<div>
				Logged in
				<button
					style="margin-bottom: 10px; padding: 5px;"
					on:click={() => {
						localStorage.removeItem('privateKey');
						localStorage.removeItem('publicKey');
						loggedInUser = null;
					}}
				>
					Log out
				</button>
			</div>
		{/if}
	</div>
</div>
<span
	id="eventsandinfo"
	style="display: flex; justify-content: center; max-width: 100%; overflow: hidden"
>
	{#if loggedInUser}
		<Feed viewAs={true} publicKey={loggedInUser} {loggedInUser} />
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

<script lang="ts">
	import { signEvent, type UnsignedEvent } from 'nostr-tools';
	const USE_WORKER = true;

	import { RelayPool, RelayPoolWorker } from 'nostr-relaypool';
	import { onDestroy, onMount } from 'svelte';
	import { newRelayPoolWorker, subscribeToEvents, windowNostr } from './helpers';

	export let publicKey: string;
	export let loggedInUser: string | null = null;
	let relayPool: RelayPool | undefined | RelayPoolWorker;
	export let viewAs: boolean;
	let cancelled = false;
	let events: HTMLElement | null = null;
	$: {
		console.log('feed! $: ' + publicKey + ' ' + viewAs + ' ' + events);
		resubscribe();
	}

	let cancel = () => {};
	let subscribedParams: any = undefined;

	function resubscribe() {
		if (!events) return;
		if (
			subscribedParams &&
			subscribedParams.publicKey === publicKey &&
			subscribedParams.viewAs === viewAs
		) {
			return;
		}
		subscribedParams = { publicKey, viewAs };
		cancel();
		events.replaceChildren();
		const start = performance.now();
		const counters = { num_events: 0, num_event2s: 0 };
		const redirectHolder = new Map();
		if (USE_WORKER) {
			relayPool = newRelayPoolWorker();
		} else {
			relayPool = new RelayPool();
		}
		let cancelled = false;
		cancel = () => {
			cancelled = true;
			relayPool?.close();
		};
		const signEvent = (event: UnsignedEvent) => window?.nostr?.signEvent(event);
		console.log('wnostr', windowNostr(), 'signevent0', signEvent);

		subscribeToEvents(
			relayPool,
			redirectHolder,
			counters,
			start,
			publicKey,
			() => cancelled,
			viewAs,
			loggedInUser,
			signEvent
		);
	}
	onMount(async () => {
		events = document.getElementById('events');
		console.log(
			'feed! onMount ' + publicKey + ' ' + viewAs + ' ' + document.getElementById('events')
		);
		resubscribe();
	});
	onDestroy(() => {
		console.log('feed onDestroy ' + publicKey);
		cancel();
	});
</script>

<div
	id="events"
	style="flex-grow: 4; display: flex; flex-direction: column; max-width: 70%; overflow: hidden"
/>

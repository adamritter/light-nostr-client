<script lang="ts">
	const USE_WORKER = false;

	import { RelayPool, RelayPoolWorker } from 'nostr-relaypool';
	import { onDestroy, onMount } from 'svelte';
	import { newRelayPoolWorker, nsecDecode, subscribeToEvents, windowNostr } from './helpers';
	import { getEventHash, signEvent, type Event, type UnsignedEvent } from 'nostr-tools';

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

	async function signEventFn(event: UnsignedEvent): Promise<Event> {
		if (localStorage.getItem('privateKey')) {
			let id = getEventHash(event);
			return {
				...event,
				id,
				sig: signEvent(event, nsecDecode(localStorage.getItem('privateKey')!)!)
			} as Event;
		}
		// @ts-ignore
		return window?.nostr?.signEvent(event);
	}

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
		// @ts-ignore
		const signEventFn2 =
			// @ts-ignore
			localStorage.getItem('privateKey') || window?.nostr?.signEvent ? signEventFn : undefined;

		subscribeToEvents(
			relayPool,
			redirectHolder,
			counters,
			start,
			publicKey,
			() => cancelled,
			viewAs,
			loggedInUser,
			signEventFn2
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
	style="flex-grow: 4; display: flex; flex-direction: column; max-width: 100%; overflow: hidden"
/>

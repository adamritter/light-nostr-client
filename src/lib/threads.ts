const debugThreads = false;

function getFinalElementId(eventId: string, eventRedirects: Map<string, string>): string {
	const originalEventId = eventId;
	if (!eventId) {
		return eventId;
	}
	let i = 0;
	while (eventRedirects.has(eventId)) {
		i++;
		eventId = eventRedirects.get(eventId)!;
		if (i > eventRedirects.size) {
			throw new Error('Infinite loop in getFinalElementId for ' + originalEventId);
			break;
		}
	}
	return eventId;
}

const detectInfiniteLoopSlow = false;

function assertNoInfiniteLoop(eventRedirects: Map<string, string>) {
	if (!detectInfiniteLoopSlow) {
		return;
	}
	const keys = eventRedirects.keys();
	for (const key of keys) {
		getFinalElementId(key, eventRedirects);
	}
}

// the second element must be a holder, the first element can be a holder or an elementid
function moveElements(from: string, to: string, eventRedirects: Map<string, string>) {
	if (from === to) {
		return;
	}
	if (debugThreads) {
		console.log('threads.ts: putUnder moveElements', from, to);
	}
	const fromHolder = document.getElementById(from);
	const toHolder = document.getElementById(to);
	if (fromHolder && toHolder) {
		eventRedirects.set(from, to);
		assertNoInfiniteLoop(eventRedirects);
		while (fromHolder.firstChild) {
			toHolder.appendChild(fromHolder.firstChild);
		}
		fromHolder.remove();
	}
}

function mergeHolders(
	holderElementId1: string,
	holderElementId2: string,
	eventRedirects: Map<string, string>
) {
	if (holderElementId1 === holderElementId2) {
		return;
	}
	// console.log('putUnder mergeHolders', holderId1, holderId2);
	holderElementId1 = getFinalElementId(holderElementId1, eventRedirects);
	holderElementId2 = getFinalElementId(holderElementId2, eventRedirects);
	if (holderElementId1 === holderElementId2) {
		return;
	}
	const holderId1 = holderElementId1 + '_holder';
	const holderId2 = holderElementId2 + '_holder';
	const holder1 = document.getElementById(holderId1);
	const holder2 = document.getElementById(holderId2);
	if (!holder1) {
		eventRedirects.set(holderElementId1, holderElementId2);
		assertNoInfiniteLoop(eventRedirects);
		return;
	}
	if (!holder2) {
		eventRedirects.set(holderElementId2, holderElementId1);
		assertNoInfiniteLoop(eventRedirects);
		return;
	}
	const holder1Score = parseFloat(holder1.style.order);
	const holder2Score = parseFloat(holder2.style.order);
	if (holder1Score > holder2Score) {
		moveElements(holderId2, holderId1, eventRedirects);
	} else {
		moveElements(holderId1, holderId2, eventRedirects);
	}
}

// Union
export function addEventRedirect(
	holderElementId: string,
	elementid: string,
	eventRedirects: Map<string, string>
) {
	if (!holderElementId || !elementid) {
		return;
	}
	const originalHolderElementId = holderElementId;
	const originalElementId = elementid;
	holderElementId = getFinalElementId(holderElementId, eventRedirects);
	elementid = getFinalElementId(elementid, eventRedirects);
	if (debugThreads) {
		console.log(
			'threads.ts addEventRedirect',
			originalHolderElementId,
			originalElementId,
			' -> ',
			holderElementId,
			elementid
		);
	}

	if (elementid != holderElementId) {
		mergeHolders(holderElementId, elementid, eventRedirects);
	}
}

/**
 * @param {String} HTML representing a single element
 * @return {Element}
 */
export function htmlToElement(html: string): HTMLElement {
	const template = document.createElement('template');
	html = html.trim(); // Never return a text node of whitespace as the result
	template.innerHTML = html;
	const node = template.content.firstChild;
	return node as HTMLElement;
}

function createOrGetHolderElement(
	eventId: string,
	score: number,
	eventRedirects: Map<string, string>
): HTMLElement {
	const holderElementId = getFinalElementId(eventId, eventRedirects) + '_holder';
	const existingHolderElement = document.getElementById(holderElementId);
	if (existingHolderElement) {
		if (debugThreads) {
			console.log('threads.ts createOrGetHolderElement: holder already exists ' + holderElementId);
		}
		// Update score
		const oldScore = parseFloat(existingHolderElement.style.order);
		if (oldScore > score) {
			// console.log('update score', holderElementId, oldScore, score);
			existingHolderElement.style.order = score.toString();
		}
		return existingHolderElement;
	}
	if (debugThreads) {
		console.log('threads.ts createOrGetHolderElement: create holder ' + holderElementId);
	}
	const holderHtml = `<span id='${holderElementId}' style='border-bottom: solid white 2px; order: ${score}; display: flex;  flex-direction: column'></span>`;
	const holderElement = htmlToElement(holderHtml);
	const eventsElement = document.getElementById('events')!;
	eventsElement.appendChild(holderElement);

	return holderElement;
}

export function putUnder(
	eventId: string,
	score: number,
	elementHTML: string,
	eventRedirects: Map<string, string>
) {
	if (document.getElementById(eventId)) {
		if (debugThreads) {
			console.log('threads.ts putUnder: element already exists', eventId);
		}
		return;
	}
	const holderElement = createOrGetHolderElement(eventId, score, eventRedirects);
	const element = htmlToElement(elementHTML);
	if (debugThreads) {
		console.log('threads.ts putUnder: add element', eventId, element.id, holderElement.id);
	}
	element.id = eventId;
	holderElement.appendChild(element);
}

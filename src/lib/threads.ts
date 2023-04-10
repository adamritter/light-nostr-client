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
	console.log('putUnder moveElements', from, to);
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

function mergeHolders(holderId1: string, holderId2: string, eventRedirects: Map<string, string>) {
	if (holderId1 === holderId2) {
		return;
	}
	// console.log('putUnder mergeHolders', holderId1, holderId2);
	holderId1 = getFinalElementId(holderId1, eventRedirects) + '_holder';
	holderId2 = getFinalElementId(holderId2, eventRedirects) + '_holder';
	if (holderId1 === holderId2) {
		return;
	}
	const holder1 = document.getElementById(holderId1);
	const holder2 = document.getElementById(holderId2);
	if (!holder1) {
		eventRedirects.set(holderId1, holderId2);
		assertNoInfiniteLoop(eventRedirects);
		return;
	}
	if (!holder2) {
		eventRedirects.set(holderId2, holderId1);
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

export function addHolderRedirect(
	holderElementId: string,
	elementid: string,
	eventRedirects: Map<string, string>
) {
	// console.log('putUnder addEventRedirect', holderElementId, elementid);
	if (!holderElementId || !elementid) {
		return;
	}
	if (eventRedirects.has(elementid)) {
		mergeHolders(holderElementId, eventRedirects.get(elementid)!, eventRedirects);
	} else {
		assertNoInfiniteLoop(eventRedirects);
		const finalElementId = getFinalElementId(holderElementId, eventRedirects);
		if (finalElementId !== elementid) {
			eventRedirects.set(elementid, getFinalElementId(holderElementId, eventRedirects));
		}
		assertNoInfiniteLoop(eventRedirects);
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

export function createOrGetHolderElement(
	eventId: string,
	score: number,
	eventRedirects: Map<string, string>
): HTMLElement {
	const holderElementId = getFinalElementId(eventId, eventRedirects) + '_holder';
	const existingHolderElement = document.getElementById(holderElementId);
	if (existingHolderElement) {
		// console.log('createOrGetHolderElement: holder already exists ' + holderElementId);
		// Update score
		const oldScore = parseFloat(existingHolderElement.style.order);
		if (oldScore > score) {
			// console.log('update score', holderElementId, oldScore, score);
			existingHolderElement.style.order = score.toString();
		}
		return existingHolderElement;
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
		console.log('putUnder: element already exists', eventId);
		return;
	}
	const holderElement = createOrGetHolderElement(eventId, score, eventRedirects);
	const element = htmlToElement(elementHTML);
	console.log('putUnder: add element', eventId, element.id, holderElement.id);
	element.id = eventId;
	holderElement.appendChild(element);
}

/*
   The ranking algorithm decides the order in which the threads are displayed.

   As theads can't be that easily predicted as they are not as refined, it's better
   to predict whether the user likes an event or not.

   counting ,,not likes'' is also interesting, it requires caching threads that are skipped.
   Another option is to add dislikes to the interface, and even make it private???

   The simplest algorithm is just to count the number of likes per person.
   Also there's a binary followed / not followed as another signal.

   I guess now these are 2 signals, logistic regression should be used.


   Table to learn:
   + note is liked by user 
   - time passed since note was created
   - note's author is followed by user 
   - number of likes
   - number of comments
   - share of likes from the author by the user in the past
   - does it contain image?
   - does it contain link?
   - does it contain video?
   - text length
   - likes by followers
*/

import Sentiment from 'sentiment';
import type { LogisticRegressor } from './logistic_regression';
import { Kind, type Event } from 'nostr-tools';

// missing: topic, content age, is_followed

// For this, logistic regressor needs to implement ratio groups
// Creator interaction ratio: For each content creator, calculate the ratio of the number of times the
// user has engaged with their content to the total number of times the user has engaged with any content.
// This can help identify the user's preferences for specific creators.
const sentiment = new Sentiment();

export function processEventForLogisticRegression(
	event: Event,
	logisticRegressor: LogisticRegressor,
	loggedInUser: string | null,
	parentEvent?: Event,
	shown = true
) {
	if (!loggedInUser) {
		return;
	}
	if (event.kind === 1 && shown) {
		logisticRegressor.addRow(event.id, event.created_at);
	}
	if (event.kind == 1) {
		if (event.content.match(/png|jpg|jpeg|gif|webp/)) {
			logisticRegressor.set(event.id, 'image', 1);
		}
		if (event.content.match(/youtube|youtu\.be/)) {
			logisticRegressor.set(event.id, 'video', 1);
		}
		if (event.content.match(/twitter\.com/)) {
			logisticRegressor.set(event.id, 'twitter', 1);
		}
		logisticRegressor.set(event.id, 'length', event.content.length);
		logisticRegressor.set(
			event.id,
			'is_reply',
			event.tags.filter((tag: string[]) => tag[0] === 'e').length > 0 ? 1 : 0
		);
		logisticRegressor.set(event.id, 'sentiment', sentiment.analyze(event.content).comparative);
		if (event.tags.filter((tag: string[]) => tag[0] === 'p' && tag[1] == loggedInUser).length) {
			logisticRegressor.set(event.id, 'reply_to_user', 1);
		}
		if (parentEvent) {
			if (event.pubkey === loggedInUser) {
				logisticRegressor.sety(parentEvent.id, 1);
			} else {
				logisticRegressor.set(
					parentEvent.id,
					'replies',
					logisticRegressor.get(parentEvent.id, 'replies') + 1
				);
			}
		}
		logisticRegressor.setGroup(event.id, 'pubkey', event.pubkey);
	} else if (event.kind === Kind.Reaction) {
		if (parentEvent) {
			if (event.pubkey === loggedInUser) {
				logisticRegressor.sety(parentEvent.id, 1);
			} else {
				logisticRegressor.set(
					parentEvent.id,
					'likes',
					logisticRegressor.get(parentEvent.id, 'likes') + 1
				);
			}
		}
	}
}

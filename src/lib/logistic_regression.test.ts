import { LogisticRegressor, transpose } from './logistic_regression';
import { expect, test } from '@jest/globals';
// @ts-ignore
import matrixInverse from 'matrix-inverse';

test('inference', () => {
	const lr = new LogisticRegressor();
	lr.sety('a', 1);
	expect(lr.inference('a')).toBe(0.5);
	lr.weights = [1];
	expect(lr.inference('a')).toBe(0.7310585786300049);
	lr.set('a', 'b', 1);
	expect(lr.inference('a')).toBe(0.7310585786300049);
	lr.weights = [1, 1];
	expect(lr.inference('a')).toBe(0.8807970779778823);
	expect(lr.get('a', 'b')).toBe(1);
});

test('matrix-inverse', () => {
	const m = [
		[2, 1, 1],
		[3, 2, 1],
		[2, 1, 2]
	];
	const inv = matrixInverse(m);
	expect(inv).toEqual([
		[3, -1, -1],
		[-4, 2, 1],
		[-1, 0, 1]
	]);
});

test('train', () => {
	const lr = new LogisticRegressor();
	lr.sety('a', 1);
	lr.sety('b', 0);
	lr.sety('c', 1);
	lr.sety('d', 1);
	lr.train();
	console.log(lr.weights);
	expect(lr.inference('b')).toBe(0.75);
});

test('transpose', () => {
	const m = [
		[1, 2, 3],
		[4, 5, 6]
	];
	const t = transpose(m);
	expect(t).toEqual([
		[1, 4],
		[2, 5],
		[3, 6]
	]);
});

test('train2vars', () => {
	const lr = new LogisticRegressor();
	lr.sety('a', 1);
	lr.sety('b', 0);
	lr.sety('c', 1);
	lr.sety('d', 1);
	lr.set('a', 'predictor', 0.9);
	lr.set('b', 'predictor', 0);
	lr.set('c', 'predictor', 1);
	lr.set('d', 'predictor', 1);
	lr.train();
	console.log(lr.weights);
	expect(lr.inference('b')).toBeCloseTo(0);
});

/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
	LogisticRegressor,
	logLikelihood,
	logisticRegression,
	sigmoid,
	transpose,
	weightedLogLikelihood,
	weightedLogisticRegression
} from './logistic_regression';
import { expect, test } from '@jest/globals';
// @ts-ignore
import matrixInverse from 'matrix-inverse';

test('inference', () => {
	const lr = new LogisticRegressor();
	lr.autoCreateRow = true;
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
	lr.autoCreateRow = true;
	lr.sety('a', 1);
	lr.sety('b', 0);
	lr.sety('c', 1);
	lr.sety('d', 1);
	lr.train(10, 1);
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
	lr.autoCreateRow = true;
	lr.sety('a', 1);
	lr.sety('b', 0);
	lr.sety('c', 1);
	lr.sety('d', 1);
	lr.set('a', 'predictor', 0.9);
	lr.set('b', 'predictor', 0);
	lr.set('c', 'predictor', 1);
	lr.set('d', 'predictor', 1);
	lr.train(10, 1);
	console.log(lr.weights);
	expect(lr.inference('b')).toBeCloseTo(0);
});

test('logistic-regression-func', () => {
	// Create matrix
	const m = [];
	const y = [];
	const a = 1,
		b = -1;
	for (let i = 0; i < 1000; i++) {
		m.push([Math.random(), Math.random()]);
		y.push(Math.random() + sigmoid(m[i][0] * a + b * m[i][1]) > 1 ? 1 : 0);
	}

	const weights = logisticRegression(m, [0, 0], y, 10);
	console.log('original log likelihood', logLikelihood(m, [0, 0], y));
	console.log('optimal log likelihood', logLikelihood(m, [a, b], y));
	console.log('new log likelihood', logLikelihood(m, weights, y));
	console.log(
		'sumy',
		y.reduce((a, b) => a + b, 0)
	);
	expect(weights[0]).toBeCloseTo(a, 0);
	expect(weights[1]).toBeCloseTo(b, 0);
});

test('weighted-logistic-regression-func', () => {
	// Create matrix
	const m = [];
	const y = [];
	const a = 1,
		b = -1;
	const dataWeights = [];
	for (let i = 0; i < 3000; i++) {
		const mm = [Math.random(), Math.random()];
		const yy = Math.random() + sigmoid(mm[0] * a + b * mm[1]) > 1 ? 1 : 0;
		if (yy === 1 || (yy === 0 && Math.random() > 0.8)) {
			m.push(mm);
			y.push(yy);
			if (yy === 0) {
				dataWeights.push(5);
			} else {
				dataWeights.push(1);
			}
		}
	}

	const weights = weightedLogisticRegression(m, [0, 0], y, dataWeights, 10);
	console.log('original log likelihood', weightedLogLikelihood(m, [0, 0], y, dataWeights));
	console.log('optimal log likelihood', weightedLogLikelihood(m, [a, b], y, dataWeights));
	console.log('new log likelihood', weightedLogLikelihood(m, weights, y, dataWeights));
	console.log(
		'sumy',
		y.reduce((a, b) => a + b, 0),
		'y==0',
		y.filter((y) => y === 0).length
	);
	expect(weights[0]).toBeCloseTo(a, 0);
	expect(weights[1]).toBeCloseTo(b, 0);
});

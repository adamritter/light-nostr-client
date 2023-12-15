/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import matrixInverse from 'matrix-inverse';

export class LogisticRegressor {
	hasRow(id: string) {
		return this.rowIndices.has(id);
	}
	memberships: Map<string, Map<string, string>> = new Map();
	setGroup(rowId: string, group: string, member: string) {
		let groupMap = this.memberships.get(group);
		if (groupMap === undefined) {
			groupMap = new Map();
			this.memberships.set(group, groupMap);
		}
		groupMap.set(rowId, member);
	}
	addRow(rowId: string, createdAt?: number, onlyPositive?: boolean): number {
		if (this.rowIndices.has(rowId)) {
			const r = this.rowIndices.get(rowId)!;
			if (createdAt !== undefined) {
				this.createdAt[r] = createdAt;
			}
			if (onlyPositive == false) {
				this.onlyPositive[r] = false;
			}
			if (onlyPositive) {
				this.ys[r] = 1;
			}
			return r;
		}
		const rowIndex = this.ys.length;
		this.rowIndices.set(rowId, rowIndex);
		const new_row = new Array(this.weights.length).fill(0.0);
		new_row[0] = 1.0;
		this.matrix.push(new_row);
		this.ys.push(onlyPositive ? 1 : 0);
		this.onlyPositive.push(onlyPositive || false);
		this.originalOnlyPositive.push(onlyPositive || false);
		if (createdAt !== undefined) {
			this.createdAt.push(createdAt);
		}
		return rowIndex;
	}
	#applyMemberships(filterRowIndexForTraining?: (rowIndex: number | undefined) => boolean) {
		console.time('applyMemberships');
		const dataWeights = this.getDataWeights();
		for (const [group, groupMap] of this.memberships) {
			const countByMember: Map<string, number> = new Map();
			const positiveCountByMember: Map<string, number> = new Map();

			for (const [rowId, member] of groupMap) {
				if (!this.autoCreateRow && !this.rowIndices.has(rowId)) {
					continue;
				}
				const rowIndex = this.rowIndices.get(rowId)!;
				if (filterRowIndexForTraining !== undefined && !filterRowIndexForTraining(rowIndex)) {
					continue;
				}
				const dataWeight = dataWeights?.[rowIndex] || 1;

				const count = countByMember.get(member) || 0;
				countByMember.set(member, count + dataWeight);

				const positiveCount = positiveCountByMember.get(member) || 0;
				positiveCountByMember.set(member, positiveCount + this.ys[rowIndex] * dataWeight);
			}

			const groupShareLabel = `${group}_share`;
			const groupPositiveRatioLabel = `${group}_positive_ratio`;
			// For setting features we don't need to filter out row index.
			for (const [rowId, member] of groupMap) {
				if (!this.autoCreateRow && !this.rowIndices.has(rowId)) {
					continue;
				}
				const count = countByMember.get(member) || 0;
				this.set(rowId, groupShareLabel, (count * 1.0) / this.matrix.length);
				const positiveCount = positiveCountByMember.get(member) || 0;
				if (count > 0) {
					this.set(rowId, groupPositiveRatioLabel, (positiveCount * 1.0) / count);
				}
			}
		}
		console.timeEnd('applyMemberships');
	}
	weights: number[] = [0];
	matrix: number[][] = [];
	labels: Map<string, number> = new Map().set('bias', 0);
	rowIndices: Map<string, number> = new Map();
	ys: number[] = [];
	createdAt: number[] = [];
	autoCreateRow = false;
	// This array is used for items that are not in the random sample, but selected positive examples.
	// The example status can change with addRow
	onlyPositive: boolean[] = [];
	// This is used for set() conditionally working so that likes / comments aren't counted twice
	originalOnlyPositive: boolean[] = [];
	#getRowIndex(rowId: string): number | undefined {
		let rowIndex = this.rowIndices.get(rowId);
		if (rowIndex === undefined) {
			if (!this.autoCreateRow) {
				return undefined;
			}
			rowIndex = this.addRow(rowId);
		}
		return rowIndex;
	}
	#getLabelIndex(label: string): number {
		let nlabel = this.labels.get(label);
		if (nlabel === undefined) {
			nlabel = this.weights.length;
			this.labels.set(label, nlabel);
			for (let i = 0; i < this.matrix.length; i++) {
				this.matrix[i].push(0.0);
			}
			this.weights.push(0.0);
		}

		return nlabel;
	}
	#checkMatrix() {
		for (let i = 0; i < this.matrix.length; i++) {
			if (this.matrix[i].length != this.weights.length) {
				console.error('matrix length mismatch', i, this.matrix[i].length, this.weights.length);
			}
		}
	}

	set(rowId: string, label: string, value: number, onlyPositive: boolean | undefined = undefined) {
		const rowIndex = this.#getRowIndex(rowId);
		if (rowIndex === undefined) {
			return;
		}
		// onlyPositive can be used to prevent double counting
		if (onlyPositive !== undefined) {
			if (this.originalOnlyPositive[rowIndex] !== onlyPositive) {
				return;
			}
		}
		const labelIndex = this.#getLabelIndex(label);
		this.matrix[rowIndex][labelIndex] = value;
	}

	sety(rowId: string, y: number) {
		const rowIndex = this.#getRowIndex(rowId);
		if (rowIndex === undefined) {
			return;
		}
		this.ys[rowIndex] = y;
	}
	setCreatedAt(rowId: string, createdAt: number) {
		const rowIndex = this.#getRowIndex(rowId);
		if (rowIndex === undefined) {
			return;
		}
		this.createdAt[rowIndex] = createdAt;
	}
	get(rowId: string, label: string): number {
		const rowIndex = this.#getRowIndex(rowId);
		const labelIndex = this.#getLabelIndex(label);
		if (rowIndex === undefined || labelIndex === undefined) {
			return 0.0;
		}
		return this.matrix[rowIndex][labelIndex];
	}
	inference(rowId: string): number | undefined {
		const rowIndex = this.#getRowIndex(rowId);
		if (rowIndex === undefined) {
			return undefined;
		}
		return this.#inferenceRow(rowIndex);
	}
	#inferenceRow(rowIndex: number): number {
		let r = 0.0;
		for (let i = 0; i < this.weights.length; i++) {
			r += this.weights[i] * this.matrix[rowIndex][i];
		}
		return sigmoid(r);
	}

	iterateWeights(count = 1, minNumPositiveExamples = 3) {
		if (this.numPositiveExamples() < minNumPositiveExamples) {
			console.error('Not enough likes to train model', this.numPositiveExamples());
			return;
		}
		this.#applyMemberships();
		this.weights = weightedLogisticRegression(
			this.matrix,
			this.weights,
			this.ys,
			this.getDataWeights(),
			count
		);
	}
	getDataWeights(): number[] | undefined {
		// Check number of positive examples for random sample part, and all numbers for onlyPositive part.
		const allNumPostiveExamples = this.numPositiveExamples();
		const onlyPositiveNumPositiveExamples = this.onlyPositive.filter((x) => x).length;
		const randomPositiveExamples = allNumPostiveExamples - onlyPositiveNumPositiveExamples;
		if (onlyPositiveNumPositiveExamples == 0 || randomPositiveExamples < 1) {
			return undefined;
		}
		const positiveWeight = randomPositiveExamples / allNumPostiveExamples;
		const r = Array(this.matrix.length).fill(1.0);
		for (let i = 0; i < this.matrix.length; i++) {
			if (this.ys[i] > 0.5) {
				r[i] = positiveWeight;
			}
		}
		return r;
	}

	evaluate(count = 10, minNumPositiveExamples = 4) {
		if (this.numPositiveExamples() < minNumPositiveExamples) {
			console.error('evaluate: Not enough likes to train model', this.numPositiveExamples());
			return;
		}
		console.log(
			'evaluate: ',
			this.numPositiveExamples(),
			' positive examples from ',
			this.ys.length,
			' rows'
		);
		this.#applyMemberships((rowIndex) => (rowIndex ? rowIndex % 2 == 1 : false));
		const trainMatrix = this.matrix.filter((_, index) => index % 2 == 1);
		const trainYs = this.ys.filter((_, index) => index % 2 == 1);
		const testMatrix = this.matrix.filter((_, index) => index % 2 == 0);
		const testYs = this.ys.filter((_, index) => index % 2 == 0);
		const dataWeights = this.getDataWeights();
		// Learn just bias
		let weights = weightedLogisticRegression(
			trainMatrix.map((v) => [v[0]]),
			[0],
			trainYs,
			dataWeights,
			count
		);
		const biasLogLikelihood = weightedLogLikelihood(
			testMatrix.map((v) => [v[0]]),
			weights,
			testYs,
			dataWeights
		);
		console.log('evaluate: bias log likelihood', biasLogLikelihood);
		// now learn all weights
		weights = weightedLogisticRegression(
			trainMatrix,
			Array(this.weights.length).fill(0.0),
			trainYs,
			dataWeights,
			count
		);
		console.log(
			'evaluate: full log likelihood',
			weightedLogLikelihood(testMatrix, weights, testYs, dataWeights)
		);
		// now go through all labels
		for (const label of this.labels.keys()) {
			if (label != 'bias') {
				this.#evaluateLabels(
					['bias', label],
					trainMatrix,
					trainYs,
					dataWeights,
					count,
					testMatrix,
					testYs
				);
				this.#evaluateLabels(
					['bias', 'log_' + label],
					trainMatrix,
					trainYs,
					dataWeights,
					count,
					testMatrix,
					testYs
				);
			}
		}
		this.#evaluateLabels(
			['bias', 'log_replies'],
			trainMatrix,
			trainYs,
			dataWeights,
			count,
			testMatrix,
			testYs
		);

		this.#evaluateLabels(
			['bias', 'is_reply', 'replies'],
			trainMatrix,
			trainYs,
			dataWeights,
			count,
			testMatrix,
			testYs
		);
		this.#evaluateLabels(
			['bias', 'is_reply', 'log_replies'],
			trainMatrix,
			trainYs,
			dataWeights,
			count,
			testMatrix,
			testYs
		);

		this.#evaluateLabels(
			['bias', 'is_reply', 'log_replies', 'reply_to_user'],
			trainMatrix,
			trainYs,
			dataWeights,
			count,
			testMatrix,
			testYs
		);
		this.#evaluateLabels(
			['bias', 'is_reply', 'log_replies', 'reply_to_user', 'log_length'],
			trainMatrix,
			trainYs,
			dataWeights,
			count,
			testMatrix,
			testYs
		);
		this.#evaluateLabels(
			['bias', 'is_reply', 'log_replies', 'reply_to_user', 'log_length', 'image'],
			trainMatrix,
			trainYs,
			dataWeights,
			count,
			testMatrix,
			testYs,
			biasLogLikelihood
		);
		this.#evaluateLabels(
			[
				'bias',
				'is_reply',
				'log_replies',
				'reply_to_user',
				'log_length',
				'image',
				'pubkey_positive_ratio'
			],
			trainMatrix,
			trainYs,
			dataWeights,
			count,
			testMatrix,
			testYs,
			biasLogLikelihood
		);
	}

	#evaluateLabels(
		labels: string[],
		trainMatrix: number[][],
		trainYs: number[],
		dataWeights: number[] | undefined,
		steps: number,
		testMatrix: number[][],
		testYs: number[],
		biasLogLikelihood?: number
	) {
		const isLog = labels.map((label) => label.startsWith('log_'));
		const withoutLog = labels.map((label) =>
			label.startsWith('log_') ? label.substring(4) : label
		);
		const labelIndices: number[] = withoutLog.map((label: string) => this.#getLabelIndex(label));
		const weights = weightedLogisticRegression(
			trainMatrix.map((v) =>
				labelIndices.map((i: number, idx: number) => (isLog[idx] ? Math.log(v[i] + 1) : v[i]))
			),
			labelIndices.map(() => 0),
			trainYs,
			dataWeights,
			steps
		);
		const ll = weightedLogLikelihood(
			testMatrix.map((v) =>
				labelIndices.map((i: number, idx: number) => (isLog[idx] ? Math.log(v[i] + 1) : v[i]))
			),
			weights,
			testYs,
			dataWeights
		);
		console.log(labels, 'evaluate: log likelihood', ll, 'weights: ', weights);
		if (biasLogLikelihood) {
			console.log('relative log likelihood: ', ll / biasLogLikelihood);
		}
	}

	numPositiveExamples(): number {
		let r = 0;
		for (let i = 0; i < this.ys.length; i++) {
			if (this.ys[i] > 0) {
				r++;
			}
		}
		return r;
	}

	logLikelihood(): number {
		// https://en.wikipedia.org/wiki/Logistic_regression#Likelihood_function
		// L(w) = sum_i y_i * w' * x_i - log(1 + exp(w' * x_i))
		let r = 0.0;
		for (let i = 0; i < this.ys.length; i++) {
			const y = this.ys[i];
			const mu = this.#inferenceRow(i);
			r += y * Math.log(mu) + (1 - y) * Math.log(1 - mu);
		}
		return r;
	}

	train(iterations = 10, minNumPositiveExamples = 3) {
		this.iterateWeights(iterations, minNumPositiveExamples);
	}
	createdBefore(createdAt: number): LogisticRegressor {
		const r = new LogisticRegressor();
		r.matrix = this.matrix.filter((_, i) => this.createdAt[i] < createdAt);
		r.labels = this.labels;
		const oldIndices = new Map();
		for (let i = 0; i < this.matrix.length; i++) {
			if (this.createdAt[i] < createdAt) {
				oldIndices.set(i, oldIndices.size);
			}
		}
		r.ys = this.ys.filter((_, i) => this.createdAt[i] < createdAt);
		r.rowIndices = new Map();
		for (const [k, v] of this.rowIndices.entries()) {
			if (oldIndices.has(v)) {
				r.rowIndices.set(k, oldIndices.get(v));
			}
		}

		r.weights = this.weights;
		r.createdAt = this.createdAt.filter((c) => c < createdAt);
		return r;
	}
}

export function logLikelihood(matrix: number[][], weights: number[], ys: number[]): number {
	// https://en.wikipedia.org/wiki/Logistic_regression#Likelihood_function
	// L(w) = sum_i y_i * w' * x_i - log(1 + exp(w' * x_i))
	let r = 0.0;
	for (let i = 0; i < ys.length; i++) {
		const y = ys[i];
		let r2 = 0.0;
		for (let j = 0; j < weights.length; j++) {
			r2 += weights[j] * matrix[i][j];
		}
		const mu = sigmoid(r2);
		r += y * Math.log(mu) + (1 - y) * Math.log(1 - mu);
	}
	return r;
}

export function weightedLogLikelihood(
	matrix: number[][],
	weights: number[],
	ys: number[],
	dataWeights: number[] | undefined
): number {
	if (dataWeights === undefined) {
		return logLikelihood(matrix, weights, ys);
	}
	let r = 0.0;
	for (let i = 0; i < ys.length; i++) {
		const y = ys[i];
		let r2 = 0.0;
		for (let j = 0; j < weights.length; j++) {
			r2 += weights[j] * matrix[i][j];
		}
		const mu = sigmoid(r2);
		r += y * Math.log(mu) + (1 - y) * Math.log(1 - mu) * dataWeights[i];
	}
	return r;
}

function assertNoNan(a: number | number[] | number[][]) {
	if (Array.isArray(a)) {
		a.forEach(assertNoNan);
	}
	// @ts-ignore
	else if (isNaN(a)) {
		// throw new Error(a);
	}
}

// Weighted logistic regression: https://en.wikipedia.org/wiki/Logistic_regression#Weighted_least_squares
// Like logistic regression with some changes: https://sharegpt.com/c/S0kp7lj
// s -> s*dataWeights*dataWeights
// (y-mu) -> (y-mu)*dataWeights
export function weightedLogisticRegression(
	x: number[][],
	w: number[],
	y: number[],
	itemWeights: number[] | undefined,
	steps = 1
) {
	if (x.length === 0) {
		throw 'You need at least 1 example';
	}
	if (x[0].length != w.length) {
		throw 'x0 length: ' + x[0].length + '=, w.length: ' + w.length;
	}
	assertNoNan(x);

	if (!itemWeights) {
		return logisticRegression(x, w, y, steps);
	}
	for (let i = 0; i < steps; i++) {
		// Logistic regression iteration step
		// https://en.wikipedia.org/wiki/Logistic_regression#Algorithm
		// mu = sigmoid(x*w)
		// s = diag(mu * (1 - mu))
		// wnew = (x' * s * x)^-1 * x' * (s * x * w + y - mu)
		// console.log('x', x);

		// console.time('iterateWeights');
		// console.timeLog('iterateWeights', 'matrix size: ' + x.length + 'x' + x[0].length);
		// console.timeLog('iterateWeights', 'compute mu');
		assertNoNan(x);
		assertNoNan(w);
		const mu0 = matrixTimesVector(x, w);
		assertNoNan(mu0);
		const mu = mu0.map(sigmoid);
		assertNoNan(mu);
		// console.timeLog('iterateWeights', 'adjust mu');
		// Make diagonal matrix invertible
		for (let i = 0; i < mu.length; i++) {
			if (mu[i] < 0.0001) mu[i] = 0.0001;
			if (mu[i] > 0.9999) mu[i] = 0.9999;
		}

		// console.timeLog('iterateWeights', 'compute diagonal');
		// should itemWeights be squared?
		// Maybe not, because item weights don't depend on item data, so it's derivative of constant multiplication.
		const mu2 = mu.map((m, i) => m * (1 - m) * itemWeights[i]);
		assertNoNan(mu2);

		// console.timeLog('iterateWeights', 'compute transpose');
		const xtranspose = transpose(x);
		assertNoNan(xtranspose);

		// console.timeLog('iterateWeights', 'compute hessian');
		const hessian = matMul(matMulWithDiag(xtranspose, mu2), x);
		assertNoNan(hessian);

		// console.timeLog('iterateWeights', 'compute inverse');
		const exp1 = matrixInverse(hessian);
		assertNoNan(exp1);

		if (!exp1) {
			throw new Error(
				'Could not invert matrix ' +
					JSON.stringify(hessian) +
					' weights ' +
					JSON.stringify(w) +
					' ys ' +
					JSON.stringify(y) +
					' mu ' +
					JSON.stringify(mu) +
					' x ' +
					JSON.stringify(x) +
					' xtranspose ' +
					JSON.stringify(xtranspose)
			);
		}

		// console.timeLog('iterateWeights', 'compute exp2');
		const exp2 = matrixTimesVector(diagWithMatMul(mu2, x), w).map(
			(x, i) => x + (y[i] - mu[i]) * itemWeights[i]
		);
		// console.timeLog('iterateWeights', 'compute weights');
		w = matrixTimesVector(matMul(exp1, xtranspose), exp2);
		// console.timeEnd('iterateWeights');
	}
	return w;
}

export function logisticRegression(x: number[][], w: number[], y: number[], steps = 1) {
	for (let i = 0; i < steps; i++) {
		// Logistic regression iteration step
		// https://en.wikipedia.org/wiki/Logistic_regression#Algorithm
		// mu = sigmoid(x*w)
		// s = diag(mu * (1 - mu))
		// wnew = (x' * s * x)^-1 * x' * (s * x * w + y - mu)
		// console.log('x', x);

		// console.time('iterateWeights');
		// console.timeLog('iterateWeights', 'matrix size: ' + x.length + 'x' + x[0].length);
		// console.timeLog('iterateWeights', 'compute mu');
		const mu = matrixTimesVector(x, w).map(sigmoid);
		// console.timeLog('iterateWeights', 'adjust mu');
		// Make diagonal matrix invertible
		for (let i = 0; i < mu.length; i++) {
			if (mu[i] < 0.0001) mu[i] = 0.0001;
			if (mu[i] > 0.9999) mu[i] = 0.9999;
		}

		// console.timeLog('iterateWeights', 'compute diagonal');

		const mu2 = mu.map((m) => m * (1 - m));
		// console.timeLog('iterateWeights', 'compute transpose');
		const xtranspose = transpose(x);
		// console.timeLog('iterateWeights', 'compute hessian');
		const hessian = matMul(matMulWithDiag(xtranspose, mu2), x);
		// console.timeLog('iterateWeights', 'compute inverse');
		const exp1 = matrixInverse(hessian);
		if (!exp1) {
			throw new Error(
				'Could not invert matrix ' +
					JSON.stringify(hessian) +
					' weights ' +
					JSON.stringify(w) +
					' ys ' +
					JSON.stringify(y) +
					' mu ' +
					JSON.stringify(mu) +
					' x ' +
					JSON.stringify(x) +
					' xtranspose ' +
					JSON.stringify(xtranspose)
			);
		}

		// console.timeLog('iterateWeights', 'compute exp2');
		const exp2 = matrixTimesVector(diagWithMatMul(mu2, x), w).map((x, i) => x + y[i] - mu[i]);
		// console.timeLog('iterateWeights', 'compute weights');
		w = matrixTimesVector(matMul(exp1, xtranspose), exp2);
		// console.timeEnd('iterateWeights');
	}
	return w;
}

function matMul(a: number[][], b: number[][]): number[][] {
	const r: number[][] = [];
	for (let i = 0; i < a.length; i++) {
		r.push(Array(b[0].length).fill(0.0));
		for (let j = 0; j < b[0].length; j++) {
			for (let k = 0; k < a[0].length; k++) {
				r[i][j] += a[i][k] * b[k][j];
			}
		}
	}
	return r;
}

function matMulWithDiag(a: number[][], b: number[]): number[][] {
	const r: number[][] = [];
	for (let i = 0; i < a.length; i++) {
		r.push(Array(a[0].length).fill(0.0));
		for (let j = 0; j < b.length; j++) {
			r[i][j] = a[i][j] * b[j];
		}
	}
	return r;
}

function diagWithMatMul(a: number[], b: number[][]): number[][] {
	const r: number[][] = [];
	for (let i = 0; i < a.length; i++) {
		r.push(Array(b[0].length).fill(0.0));
		for (let j = 0; j < b[0].length; j++) {
			r[i][j] += a[i] * b[i][j];
		}
	}
	return r;
}
function vecMul(a: number[], b: number[]): number[] {
	const r = Array(a.length).fill(0.0);
	for (let i = 0; i < a.length; i++) {
		r[i] = a[i] * b[i];
	}
	return r;
}

function dot(a: number[], b: number[]): number {
	let r = 0.0;
	for (let i = 0; i < a.length; i++) {
		r += a[i] * b[i];
	}
	return r;
}

export function sigmoid(x: number): number {
	return 1 / (1 + Math.exp(-x));
}

function rowVectorTimesMatrix(v: number[], m: number[][]): number[] {
	// Output is a row Vector
	const r = [];
	for (let i = 0; i < m[0].length; i++) {
		r.push(
			dot(
				v,
				m.map((row) => row[i])
			)
		);
	}
	return r;
}

export function transpose(m: number[][]): number[][] {
	const r: number[][] = [];
	for (let i = 0; i < m[0].length; i++) {
		r.push(Array(m.length).fill(0.0));
		for (let j = 0; j < m.length; j++) {
			r[i][j] = m[j][i];
		}
	}
	return r;
}

function matrixTimesVector(m: number[][], v: number[]): number[] {
	const r = Array(m.length).fill(0.0);
	for (let i = 0; i < m.length; i++) {
		r[i] = dot(m[i], v);
	}
	return r;
}

function predictProbabilities(X: number[][], w: number[]) {
	const n = X.length;
	const p = new Array(n);

	for (let i = 0; i < n; i++) {
		let z = 0;
		for (let j = 0; j < w.length; j++) {
			z += X[i][j] * w[j];
		}
		p[i] = sigmoid(z);
	}

	return p;
}

/*
buggy?

function computeHessian(X: number[][], p: number[]) {
	const n = X.length;
	const m = X[0].length;
	const H = new Array(m).fill(null).map(() => new Array(m).fill(0));

	for (let i = 0; i < m; i++) {
		for (let j = 0; j < m; j++) {
			let Hij = 0;
			for (let k = 0; k < n; k++) {
				const S_kk = p[k] * (1 - p[k]);
				Hij -= X[k][i] * S_kk * X[k][j];
			}
			H[i][j] = Hij;
		}
	}

	return H;
}
*/

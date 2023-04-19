/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import matrixInverse from 'matrix-inverse';

export class LogisticRegressor {
	memberships: Map<string, Map<string, string>> = new Map();
	setGroup(rowId: string, group: string, member: string) {
		let groupMap = this.memberships.get(group);
		if (groupMap === undefined) {
			groupMap = new Map();
			this.memberships.set(group, groupMap);
		}
		groupMap.set(rowId, member);
	}
	addRow(rowId: string, createdAt: number) {
		if (this.rowIndices.has(rowId)) {
			return;
		}
		const rowIndex = this.ys.length;
		this.rowIndices.set(rowId, rowIndex);
		const new_row = new Array(this.weights.length).fill(0.0);
		new_row[0] = 1.0;
		this.matrix.push(new_row);
		this.ys.push(0);
		this.createdAt.push(createdAt);
	}
	#applyMemberships(filterRowIndexForTraining?: (rowIndex: number | undefined) => boolean) {
		console.time('applyMemberships');
		for (const [group, groupMap] of this.memberships) {
			const countByMember = new Map();
			for (const [rowId, member] of groupMap) {
				if (!this.autoCreateRow && !this.rowIndices.has(rowId)) {
					continue;
				}
				if (
					filterRowIndexForTraining !== undefined &&
					!filterRowIndexForTraining(this.rowIndices.get(rowId)!)
				) {
					continue;
				}
				let count = countByMember.get(member);
				if (count === undefined) {
					count = 0;
				}
				countByMember.set(member, count + 1);
			}
			const likeCountByMember = new Map();
			for (const [rowId, member] of groupMap) {
				if (!this.autoCreateRow && !this.rowIndices.has(rowId)) {
					continue;
				}
				if (
					filterRowIndexForTraining !== undefined &&
					!filterRowIndexForTraining(this.rowIndices.get(rowId)!)
				) {
					continue;
				}
				const likeCount = likeCountByMember.get(member) || 0;
				const rowIndex = this.rowIndices.get(rowId);
				if (rowIndex !== undefined) {
					likeCountByMember.set(member, likeCount + this.ys[rowIndex]);
				}
			}
			const groupShareLabel = `${group}_share`;
			const groupLikeRatioLabel = `${group}_like_ratio`;
			// For setting features we don't need to filter out row index.
			for (const [rowId, member] of groupMap) {
				if (!this.autoCreateRow && !this.rowIndices.has(rowId)) {
					continue;
				}
				const count = countByMember.get(member) || 0;
				this.set(rowId, groupShareLabel, (count * 1.0) / this.matrix.length);
				const likeCount = likeCountByMember.get(member) || 0;
				if (count > 0) {
					this.set(rowId, groupLikeRatioLabel, (likeCount * 1.0) / count);
				}
			}
		}
		console.timeEnd('applyMemberships');
	}
	weights: number[] = [0];
	matrix: number[][] = [];
	labels: Map<string, number> = new Map();
	rowIndices: Map<string, number> = new Map();
	ys: number[] = [];
	createdAt: number[] = [];
	autoCreateRow = false;
	#getRowIndex(rowId: string): number | undefined {
		let rowIndex = this.rowIndices.get(rowId);
		if (rowIndex === undefined) {
			if (!this.autoCreateRow) {
				return undefined;
			}
			rowIndex = this.ys.length;
			this.rowIndices.set(rowId, rowIndex);
			const new_row = new Array(this.weights.length).fill(0.0);
			new_row[0] = 1.0;
			this.matrix.push(new_row);
			this.ys.push(0);
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

	set(rowId: string, label: string, value: number) {
		// this.checkMatrix();
		const rowIndex = this.#getRowIndex(rowId);
		if (rowIndex === undefined) {
			return;
		}
		// this.checkMatrix();
		const labelIndex = this.#getLabelIndex(label);
		// this.checkMatrix();
		this.matrix[rowIndex][labelIndex] = value;
		// this.checkMatrix();
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
		this.weights = logisticRegression(this.matrix, this.weights, this.ys, count);
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
		// Learn just bias
		let weights = logisticRegression(
			trainMatrix.map((v) => [v[0]]),
			[0],
			trainYs,
			count
		);
		console.log(
			'evaluate: bias log likelihood',
			logLikelihood(
				testMatrix.map((v) => [v[0]]),
				weights,
				testYs
			)
		);
		// now learn all weights
		weights = logisticRegression(trainMatrix, Array(this.weights.length).fill(0.0), trainYs, count);
		console.log('evaluate: full log likelihood', logLikelihood(testMatrix, weights, testYs));
		// now go through all labels
		for (const label of this.labels.keys()) {
			const labelIndex = this.#getLabelIndex(label);
			const weights = logisticRegression(
				trainMatrix.map((v) => [v[0], v[labelIndex]]),
				[0, 0],
				trainYs,
				count
			);
			console.log(
				label,
				'evaluate: log likelihood',
				logLikelihood(
					testMatrix.map((v) => [v[0], v[labelIndex]]),
					weights,
					testYs
				)
			);
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

function logLikelihood(matrix: number[][], weights: number[], ys: number[]): number {
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

function logisticRegression(x: number[][], w: number[], y: number[], steps = 1) {
	for (let i = 0; i < steps; i++) {
		// Logistic regression iteration step
		// https://en.wikipedia.org/wiki/Logistic_regression#Algorithm
		// mu = sigmoid(x*w)
		// s = diag(mu * (1 - mu))
		// wnew = (x' * s * x)^-1 * x' * (s * x * w + y - mu)
		console.log('x', x);

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

function sigmoid(x: number): number {
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

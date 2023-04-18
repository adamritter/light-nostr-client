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
	#applyMemberships() {
		console.time('applyMemberships');
		for (const [group, groupMap] of this.memberships) {
			const countByMember = new Map();
			for (const [_, member] of groupMap) {
				let count = countByMember.get(member);
				if (count === undefined) {
					count = 0;
				}
				countByMember.set(member, count + 1);
			}
			const likeCountByMember = new Map();
			for (const [rowId, member] of groupMap) {
				const likeCount = likeCountByMember.get(member) || 0;
				const rowIndex = this.rowIndices.get(rowId);
				if (rowIndex !== undefined) {
					likeCountByMember.set(member, likeCount + this.ys[rowIndex]);
				}
			}
			const groupShareLabel = `${group}_share`;
			const groupLikeRatioLabel = `${group}_like_ratio`;
			for (const [rowId, member] of groupMap) {
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
	#getRowIndex(rowId: string): number {
		let rowIndex = this.rowIndices.get(rowId);
		if (rowIndex === undefined) {
			rowIndex = this.ys.length;
			this.rowIndices.set(rowId, rowIndex);
			const new_row = new Array(this.labels.size).fill(0.0);
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

	set(rowId: string, label: string, value: number) {
		this.matrix[this.#getRowIndex(rowId)][this.#getLabelIndex(label)] = value;
	}
	sety(rowId: string, y: number) {
		this.ys[this.#getRowIndex(rowId)] = y;
	}
	setCreatedAt(x: string, createdAt: number) {
		this.createdAt[this.#getRowIndex(x)] = createdAt;
	}
	get(rowId: string, label: string): number {
		if (!this.rowIndices.has(rowId) || !this.labels.has(label)) {
			return 0.0;
		}
		return this.matrix[this.#getRowIndex(rowId)][this.#getLabelIndex(label)];
	}
	inference(rowId: string): number | undefined {
		if (!this.rowIndices.has(rowId)) {
			return undefined;
		}
		return this.#inferenceRow(this.#getRowIndex(rowId));
	}
	#inferenceRow(rowIndex: number): number {
		let r = 0.0;
		for (let i = 0; i < this.weights.length; i++) {
			r += this.weights[i] * this.matrix[rowIndex][i];
		}
		return sigmoid(r);
	}

	// 	iterateWeights: 0.01416015625 ms compute mu
	// logistic_regression.ts:74 iterateWeights: 2.294921875 ms adjust mu
	// logistic_regression.ts:81 iterateWeights: 2.634033203125 ms compute diagonal
	// logistic_regression.ts:89 iterateWeights: 71.906005859375 ms compute transpose
	// logistic_regression.ts:92 iterateWeights: 73.701171875 ms compute hessian
	// logistic_regression.ts:94 iterateWeights: 198.4970703125 ms compute inverse
	// logistic_regression.ts:115 iterateWeights: 198.970947265625 ms compute exp2
	// logistic_regression.ts:137 iterateWeights: 367.073974609375 ms compute weights
	// logistic_regression.ts:139 iterateWeights: 375.93994140625 ms

	// 	iterateWeights: 0.01513671875 ms compute mu
	// logistic_regression.ts:84 iterateWeights: 2.301025390625 ms adjust mu
	// logistic_regression.ts:91 iterateWeights: 2.830078125 ms compute diagonal
	// logistic_regression.ts:94 iterateWeights: 3.10791015625 ms compute transpose
	// logistic_regression.ts:97 iterateWeights: 5.135009765625 ms compute hessian
	// logistic_regression.ts:99 iterateWeights: 20.071044921875 ms compute inverse
	// logistic_regression.ts:118 iterateWeights: 21.076904296875 ms compute exp2
	// logistic_regression.ts:138 iterateWeights: 31.834228515625 ms compute weights
	// logistic_regression.ts:140 iterateWeights: 43.407958984375 ms

	iterateWeights(count = 1) {
		this.#applyMemberships();
		for (let i = 0; i < count; i++) {
			this.#iterateWeightsInner();
		}
	}
	#iterateWeightsInner() {
		// Logistic regression iteration step
		// https://en.wikipedia.org/wiki/Logistic_regression#Algorithm
		// mu = sigmoid(x*w)
		// s = diag(mu * (1 - mu))
		// wnew = (x' * s * x)^-1 * x' * (s * x * w + y - mu)
		console.time('iterateWeights');
		console.timeLog(
			'iterateWeights',
			'matrix size: ' + this.matrix.length + 'x' + this.matrix[0].length
		);
		console.timeLog('iterateWeights', 'compute mu');
		const mu = matrixTimesVector(this.matrix, this.weights).map(sigmoid);
		console.timeLog('iterateWeights', 'adjust mu');
		// Make diagonal matrix invertible
		for (let i = 0; i < mu.length; i++) {
			if (mu[i] < 0.0001) mu[i] = 0.0001;
			if (mu[i] > 0.9999) mu[i] = 0.9999;
		}

		console.timeLog('iterateWeights', 'compute diagonal');

		const mu2 = mu.map((m) => m * (1 - m));
		console.timeLog('iterateWeights', 'compute transpose');
		const x = this.matrix;
		const xtranspose = transpose(x);
		console.timeLog('iterateWeights', 'compute hessian');
		const hessian = matMul(matMulWithDiag(xtranspose, mu2), x);
		console.timeLog('iterateWeights', 'compute inverse');
		const exp1 = matrixInverse(hessian);
		if (!exp1) {
			throw new Error(
				'Could not invert matrix ' +
					JSON.stringify(hessian) +
					' weights ' +
					JSON.stringify(this.weights) +
					' ys ' +
					JSON.stringify(this.ys) +
					' mu ' +
					JSON.stringify(mu) +
					' x ' +
					JSON.stringify(x) +
					' xtranspose ' +
					JSON.stringify(xtranspose)
			);
		}

		console.timeLog('iterateWeights', 'compute exp2');
		const exp2 = matrixTimesVector(diagWithMatMul(mu2, x), this.weights).map(
			(x, i) => x + this.ys[i] - mu[i]
		);
		console.timeLog('iterateWeights', 'compute weights');
		this.weights = matrixTimesVector(matMul(exp1, xtranspose), exp2);
		console.timeEnd('iterateWeights');
	}
	logLikelihood(): number {
		// https://en.wikipedia.org/wiki/Logistic_regression#Likelihood_function
		// L(w) = sum_i y_i * w' * x_i - log(1 + exp(w' * x_i))
		const x = this.matrix;
		const exp1 = matrixTimesVector(x, this.weights).map((x) => Math.exp(x));
		const exp2 = exp1.map((x) => Math.log(1 + x));
		return (
			vecMul(this.ys, matrixTimesVector(x, this.weights)).reduce((a, b) => a + b) -
			exp2.reduce((a, b) => a + b)
		);
	}
	train(iterations = 10) {
		this.iterateWeights(iterations);
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

function diag(v: number[]): number[][] {
	const r: number[][] = [];
	for (let i = 0; i < v.length; i++) {
		r.push([]);
		for (let j = 0; j < v.length; j++) {
			r[i].push(i === j ? v[i] : 0);
		}
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

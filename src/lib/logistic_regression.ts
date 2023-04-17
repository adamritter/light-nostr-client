// @ts-ignore
import matrixInverse from 'matrix-inverse';

export class LogisticRegressor {
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
	iterateWeights() {
		// Logistic regression iteration step
		// https://en.wikipedia.org/wiki/Logistic_regression#Algorithm
		// mu = sigmoid(x*w)
		// s = diag(mu * (1 - mu))
		// wnew = (x' * s * x)^-1 * x' * (s * x * w + y - mu)
		const mu = matrixTimesVector(this.matrix, this.weights).map(sigmoid);
		// Make diagonal matrix invertible
		for (let i = 0; i < mu.length; i++) {
			if (mu[i] < 0.0001) mu[i] = 0.0001;
			if (mu[i] > 0.9999) mu[i] = 0.9999;
		}

		const s = diag(
			vecMul(
				mu,
				mu.map((m) => 1 - m)
			)
		);
		const x = this.matrix;
		const xtranspose = transpose(x);
		const toInvert = matMul(matMul(xtranspose, s), x);
		const exp1 = matrixInverse(toInvert);
		if (!exp1) {
			throw new Error(
				'Could not invert matrix ' +
					JSON.stringify(toInvert) +
					' weights ' +
					JSON.stringify(this.weights) +
					' ys ' +
					JSON.stringify(this.ys) +
					' mu ' +
					JSON.stringify(mu) +
					' s ' +
					JSON.stringify(s) +
					' x ' +
					JSON.stringify(x) +
					' xtranspose ' +
					JSON.stringify(xtranspose)
			);
		}

		const exp2 = matrixTimesVector(matMul(s, x), this.weights).map(
			(x, i) => x + this.ys[i] - mu[i]
		);
		console.log(
			'exp1',
			exp1,
			'exp2',
			exp2,
			'weights',
			this.weights,
			'ys',
			this.ys,
			'mu',
			mu,
			's',
			s,
			'x',
			x,
			'xtranspose',
			xtranspose
		);
		this.weights = matrixTimesVector(matMul(exp1, xtranspose), exp2);
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
	train() {
		for (let i = 0; i < 100; i++) {
			this.iterateWeights();
		}
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
		r.push([]);
		for (let j = 0; j < b[0].length; j++) {
			r[i].push(0.0);
			for (let k = 0; k < a[0].length; k++) {
				r[i][j] += a[i][k] * b[k][j];
			}
		}
	}
	return r;
}

function vecMul(a: number[], b: number[]): number[] {
	const r = [];
	for (let i = 0; i < a.length; i++) {
		r.push(a[i] * b[i]);
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
		r.push([]);
		for (let j = 0; j < m.length; j++) {
			r[i].push(m[j][i]);
		}
	}
	return r;
}

function matrixTimesVector(m: number[][], v: number[]): number[] {
	const r = [];
	for (let i = 0; i < m.length; i++) {
		r.push(dot(m[i], v));
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

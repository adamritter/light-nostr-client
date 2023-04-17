/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
	testMatch: ['**/*test.[jt]s'],
	testPathIgnorePatterns: ['/node_modules/', '/.git/', './tests'],
	expand: true,
	silent: false,
	preset: 'ts-jest',
	testEnvironment: 'node',
	testTimeout: 200
};

module.exports = config;
// export default config

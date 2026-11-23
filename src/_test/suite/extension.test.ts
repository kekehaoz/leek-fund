import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {
	calculateEma,
	calculateZhiXingTrendLines,
} from '../../shared/trendLines';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.equal(-1, [1, 2, 3].indexOf(5));
		assert.equal(-1, [1, 2, 3].indexOf(0));
	});

	test('calculates the ZhiXing white line with double EMA10', () => {
		const values = Array.from({ length: 120 }, (_, index) => index + 1);
		const firstEma = calculateEma(values, 10);
		const expected = calculateEma(firstEma, 10).pop();
		assert.equal(calculateZhiXingTrendLines(values).whiteLine, expected);
	});

	test('calculates the yellow line from 14/28/57/114 day SMAs', () => {
		const values = Array.from({ length: 114 }, (_, index) => index + 1);
		const expected = ((107.5 + 100.5 + 86 + 57.5) / 4);
		assert.equal(calculateZhiXingTrendLines(values).yellowLine, expected);
	});

	test('does not publish a yellow line without 114 closes', () => {
		assert.equal(calculateZhiXingTrendLines(Array(113).fill(10)).yellowLine, null);
	});
});

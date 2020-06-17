/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import expect from '@kbn/expect';
import { SuperTest } from 'supertest';
import { SAVED_OBJECT_TEST_CASES as CASES } from '../lib/saved_object_test_cases';
import { SPACES } from '../lib/spaces';
import { expectResponses, getUrlPrefix, getTestTitle } from '../lib/saved_object_test_utils';
import { ExpectResponseBody, TestCase, TestDefinition, TestSuite } from '../lib/types';

export interface ResolveImportErrorsTestDefinition extends TestDefinition {
  request: {
    objects: Array<{ type: string; id: string; originId?: string }>;
    retries: Array<
      { type: string; id: string } & ({ overwrite: true; idToOverwrite?: string } | {})
    >;
  };
  overwrite: boolean;
}
export type ResolveImportErrorsTestSuite = TestSuite<ResolveImportErrorsTestDefinition>;
export interface ResolveImportErrorsTestCase extends TestCase {
  originId?: string;
  idToOverwrite?: string; // only used for overwrite retries for multi-namespace object types
  successParam?: string;
  failure?: 400 | 409; // only used for permitted response case
}

const NEW_ATTRIBUTE_KEY = 'title'; // all type mappings include this attribute, for simplicity's sake
const NEW_ATTRIBUTE_VAL = `New attribute value ${Date.now()}`;

// these five saved objects already exist in the sample data:
//  * id: conflict_1
//  * id: conflict_2a, originId: conflict_2
//  * id: conflict_2b, originId: conflict_2
//  * id: conflict_3
//  * id: conflict_4a, originId: conflict_4
// using the six conflict test case objects below, we can exercise various permutations of exact/inexact/ambiguous conflict scenarios
const CID = 'conflict_';
export const TEST_CASES = Object.freeze({
  ...CASES,
  CONFLICT_1A_OBJ: Object.freeze({
    type: 'sharedtype',
    id: `${CID}1a`,
    originId: `${CID}1`,
    idToOverwrite: `${CID}1`,
  }),
  CONFLICT_1B_OBJ: Object.freeze({ type: 'sharedtype', id: `${CID}1b`, originId: `${CID}1` }),
  CONFLICT_2C_OBJ: Object.freeze({
    type: 'sharedtype',
    id: `${CID}2c`,
    originId: `${CID}2`,
    idToOverwrite: `${CID}2a`,
  }),
  CONFLICT_2D_OBJ: Object.freeze({
    type: 'sharedtype',
    id: `${CID}2d`,
    originId: `${CID}2`,
    idToOverwrite: `${CID}2b`,
  }),
  CONFLICT_3A_OBJ: Object.freeze({
    type: 'sharedtype',
    id: `${CID}3a`,
    originId: `${CID}3`,
    idToOverwrite: `${CID}3`,
  }),
  CONFLICT_4_OBJ: Object.freeze({ type: 'sharedtype', id: `${CID}4`, idToOverwrite: `${CID}4a` }),
});

/**
 * Test cases have additional properties that we don't want to send in HTTP Requests
 */
const createRequest = (
  { type, id, originId, idToOverwrite }: ResolveImportErrorsTestCase,
  overwrite: boolean
): ResolveImportErrorsTestDefinition['request'] => ({
  objects: [{ type, id, ...(originId && { originId }) }],
  retries: overwrite
    ? [{ type, id, overwrite, ...(idToOverwrite && { idToOverwrite }) }]
    : [{ type, id }],
});

export function resolveImportErrorsTestSuiteFactory(
  es: any,
  esArchiver: any,
  supertest: SuperTest<any>
) {
  const expectForbidden = expectResponses.forbidden('bulk_create');
  const expectResponseBody = (
    testCases: ResolveImportErrorsTestCase | ResolveImportErrorsTestCase[],
    statusCode: 200 | 403,
    spaceId = SPACES.DEFAULT.spaceId
  ): ExpectResponseBody => async (response: Record<string, any>) => {
    const testCaseArray = Array.isArray(testCases) ? testCases : [testCases];
    if (statusCode === 403) {
      const types = testCaseArray.map((x) => x.type);
      await expectForbidden(types)(response);
    } else {
      // permitted
      const { success, successCount, successResults, errors } = response.body;
      const expectedSuccesses = testCaseArray.filter((x) => !x.failure);
      const expectedFailures = testCaseArray.filter((x) => x.failure);
      expect(success).to.eql(expectedFailures.length === 0);
      expect(successCount).to.eql(expectedSuccesses.length);
      if (expectedFailures.length) {
        expect(errors).to.have.length(expectedFailures.length);
      } else {
        expect(response.body).not.to.have.property('errors');
      }
      for (let i = 0; i < expectedSuccesses.length; i++) {
        const { type, id, successParam, idToOverwrite } = expectedSuccesses[i];
        // we don't know the order of the returned successResults; search for each one
        const object = (successResults as Array<Record<string, unknown>>).find(
          (x) => x.type === type && x.id === id
        );
        expect(object).not.to.be(undefined);
        const newId = object!.newId as string;
        if (successParam === 'newId') {
          // Kibana created the object with a different ID than what was specified in the import
          // This can happen due to an unresolvable conflict (so the new ID will be random), or due to an inexact match (so the new ID will
          // be equal to the ID or originID of the existing object that it inexactly matched)
          if (idToOverwrite) {
            expect(newId).to.be(idToOverwrite);
          } else {
            // the new ID was randomly generated
            expect(newId).to.match(/^[0-9a-f-]{36}$/);
          }
        } else {
          expect(newId).to.be(undefined);
        }
        const { _source } = await expectResponses.successCreated(es, spaceId, type, newId ?? id);
        expect(_source[type][NEW_ATTRIBUTE_KEY]).to.eql(NEW_ATTRIBUTE_VAL);
      }
      for (let i = 0; i < expectedFailures.length; i++) {
        const { type, id, failure } = expectedFailures[i];
        // we don't know the order of the returned errors; search for each one
        const object = (errors as Array<Record<string, unknown>>).find(
          (x) => x.type === type && x.id === id
        );
        expect(object).not.to.be(undefined);
        if (failure === 400) {
          expect(object!.error).to.eql({ type: 'unsupported_type' });
        } else {
          // 409
          expect(object!.error).to.eql({ type: 'conflict' });
        }
      }
    }
  };
  const createTestDefinitions = (
    testCases: ResolveImportErrorsTestCase | ResolveImportErrorsTestCase[],
    forbidden: boolean,
    overwrite: boolean,
    options?: {
      spaceId?: string;
      singleRequest?: boolean;
      responseBodyOverride?: ExpectResponseBody;
    }
  ): ResolveImportErrorsTestDefinition[] => {
    const cases = Array.isArray(testCases) ? testCases : [testCases];
    const responseStatusCode = forbidden ? 403 : 200;
    if (!options?.singleRequest) {
      // if we are testing cases that should result in a forbidden response, we can do each case individually
      // this ensures that multiple test cases of a single type will each result in a forbidden error
      return cases.map((x) => ({
        title: getTestTitle(x, responseStatusCode),
        request: createRequest(x, overwrite),
        responseStatusCode,
        responseBody:
          options?.responseBodyOverride ||
          expectResponseBody(x, responseStatusCode, options?.spaceId),
        overwrite,
      }));
    }
    // batch into a single request to save time during test execution
    return [
      {
        title: getTestTitle(cases, responseStatusCode),
        request: cases
          .map((x) => createRequest(x, overwrite))
          .reduce((acc, cur) => ({
            objects: [...acc.objects, ...cur.objects],
            retries: [...acc.retries, ...cur.retries],
          })),
        responseStatusCode,
        responseBody:
          options?.responseBodyOverride ||
          expectResponseBody(cases, responseStatusCode, options?.spaceId),
        overwrite,
      },
    ];
  };

  const makeResolveImportErrorsTest = (describeFn: Mocha.SuiteFunction) => (
    description: string,
    definition: ResolveImportErrorsTestSuite
  ) => {
    const { user, spaceId = SPACES.DEFAULT.spaceId, tests } = definition;

    describeFn(description, () => {
      before(() => esArchiver.load('saved_objects/spaces'));
      after(() => esArchiver.unload('saved_objects/spaces'));

      const attrs = { attributes: { [NEW_ATTRIBUTE_KEY]: NEW_ATTRIBUTE_VAL } };

      for (const test of tests) {
        it(`should return ${test.responseStatusCode} ${test.title}`, async () => {
          const requestBody = test.request.objects
            .map((obj) => JSON.stringify({ ...obj, ...attrs }))
            .join('\n');
          await supertest
            .post(`${getUrlPrefix(spaceId)}/api/saved_objects/_resolve_import_errors`)
            .auth(user?.username, user?.password)
            .field('retries', JSON.stringify(test.request.retries))
            .attach('file', Buffer.from(requestBody, 'utf8'), 'export.ndjson')
            .expect(test.responseStatusCode)
            .then(test.responseBody);
        });
      }
    });
  };

  const addTests = makeResolveImportErrorsTest(describe);
  // @ts-ignore
  addTests.only = makeResolveImportErrorsTest(describe.only);

  return {
    addTests,
    createTestDefinitions,
    expectForbidden,
  };
}

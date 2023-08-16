export type ExpectPluginConfig = {
  /**
   * @title Output format
   */
  outputFormat?: 'pretty' | 'json' | 'prettyError' | 'silent';
  /**
   * (Deprecated) Formatter
   * Please use the `outputFormat` option instead.
   * @deprecated true
   * @title Formatter
   */
  formatter?: ExpectPluginConfig['outputFormat'];
  /**
   * Reports failures from expect plugin as errors
   * in the test report.
   * @default false
   * @title Report failures as errors
   */
  reportFailuresAsErrors?: boolean;
  /**
   * Sets a 200 OK status code expectation for all requests.
   * @default false
   * @title Expect 200 by default
   */
  expectDefault200?: boolean;
};

export type ExpectPluginMetrics = {
  /**
   * Check that the response status code.
   * If the list of status codes is provided, checks that the response
   * status code is present in the list.
   * https://www.artillery.io/docs/reference/extensions/expect#statuscode
   * @title Status code
   */
  statusCode?: number | Array<number>;
  /**
   * Check that the response status code is not present
   * in the given list.
   * https://www.artillery.io/docs/reference/extensions/expect#notstatuscode
   * @title Not status code
   */
  notStatusCode?: Array<number>;
  /**
   * Check that the value of the `Content-Type` response header.
   * https://www.artillery.io/docs/reference/extensions/expect#contenttype
   * @title Content type
   */
  contentType?: string;
  /**
   * Check that the response object has the given property.
   * https://www.artillery.io/docs/reference/extensions/expect#hasproperty-and-nothasproperty
   * @title Has property
   */
  hasProperty?: string;
  /**
   * Check that the response object doesn't have the given property.
   * https://www.artillery.io/docs/reference/extensions/expect#hasproperty-and-nothasproperty
   * @title Not has property
   */
  notHasProperty?: string;
  /**
   * Check that two or more values are the same.
   * https://www.artillery.io/docs/reference/extensions/expect#equals
   * @title Equals
   */
  equals?: Array<string>;
  /**
   * Check that the response contains the given header.
   * https://www.artillery.io/docs/reference/extensions/expect#hasheader
   * @title Has header
   */
  hasHeader?: string;
  /**
   * Check that the response contains a header and its value
   * matches is present in the list.
   * https://www.artillery.io/docs/reference/extensions/expect#headerequals
   * @title Header equals
   */
  headerEquals?: Array<string>;
  /**
   * Check that the response matches a regular expression.
   * https://www.artillery.io/docs/reference/extensions/expect#matchesregexp
   * @title
   */
  matchesRegexp?: string;
  /**
   * Check the presence of a cache hit/miss header from a CDN.
   * https://www.artillery.io/docs/reference/extensions/expect#cdnhit
   * @title CDN hit
   */
  cdnHit?: boolean;
};

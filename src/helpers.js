/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import { HDPublicKey, Address } from 'bitcore-lib';

import config from './config';
import network from './network';
import { BLOCK_VERSION, CREATE_TOKEN_TX_VERSION, DEFAULT_TX_VERSION, MERGED_MINED_BLOCK_VERSION, DECIMAL_PLACES } from './constants';
import { AddressError, OutputValueError, ConstantNotSet, CreateTokenTxInvalid, MaximumNumberInputsError, MaximumNumberOutputsError, XPubError } from './errors';

/**
 * Helper methods
 *
 * @namespace Helpers
 */

const helpers = {
  /**
   * Update a list with a new element, respecting the maximum
   * If list is full, remove the last element before adding the new one.
   *
   * @param {Array} list Array to receive the new element
   * @param {*} newEl New element to be added to the list
   * @param {number} max Maximum number of elements that the list can have
   *
   * @return {string} Type of the object
   *
   * @memberof Helpers
   * @inner
   */
  updateListWs(list, newEl, max) {
    // We remove the last element if we already have the max
    if (list.length === max) {
      list.pop();
    }
    // Then we add the new on in the first position
    list.splice(0, 0, newEl);
    return list;
  },


  /**
   * Get object type (Transaction or Block)
   *
   * @param {Object} tx Object to get the type
   *
   * @return {string} Type of the object
   *
   * @memberof Helpers
   * @inner
   */
  getTxType(tx) {
    if (this.isBlock(tx)) {
      if (tx.version === BLOCK_VERSION) {
        return 'Block';
      } else if (tx.version === MERGED_MINED_BLOCK_VERSION) {
        return 'Merged Mining Block';
      }
    } else {
      if (tx.version === DEFAULT_TX_VERSION) {
        return 'Transaction';
      } else if (tx.version === CREATE_TOKEN_TX_VERSION) {
        return 'Create Token Transaction';
      }
    }

    // If there is no match
    return 'Unknown';
  },

  /**
   * Check if object is a block or a transaction
   *
   * @param {Object} tx Transaction to be checked
   *
   * @return {boolean} true if object is a block, false otherwise
   *
   * @memberof Helpers
   * @inner
   */
  isBlock(tx) {
    return tx.version === BLOCK_VERSION || tx.version === MERGED_MINED_BLOCK_VERSION;
  },


  /**
   * Round float to closest int
   *
   * @param {number} n Number to be rounded
   *
   * @return {number} Closest integer to n passed
   *
   * @memberof Helpers
   * @inner
   */
  roundFloat(n) {
    return Math.round(n*100)/100
  },

  /**
   * Get the formatted value with decimal places and thousand separators
   *
   * @param {number} value Amount to be formatted
   *
   * @return {string} Formatted value
   *
   * @memberof Helpers
   * @inner
   */
  prettyValue(value) {
    const fixedPlaces = (value/10**DECIMAL_PLACES).toFixed(DECIMAL_PLACES);
    const integerPart = fixedPlaces.split('.')[0];
    const decimalPart = fixedPlaces.split('.')[1];
    const integerFormated = new Intl.NumberFormat('en-US').format(Math.abs(integerPart));
    const signal = value < 0 ? '-' : '';
    return `${signal}${integerFormated}.${decimalPart}`;
  },

  /**
   * Validate if the passed version is valid, comparing with the minVersion
   *
   * @param {string} version Version to check if is valid
   * @param {string} minVersion Minimum allowed version
   *
   * @return {boolean}
   *
   * @memberof Helpers
   * @inner
   */
  isVersionAllowed(version, minVersion) {
    // Verifies if the version in parameter is allowed to make requests to other min version
    if (version.includes('beta') !== minVersion.includes('beta')) {
      // If one version is beta and the other is not, it's not allowed to use it
      return false;
    }

    // Clean the version string to have an array of integers
    // Check for each value if the version is allowed
    let versionTestArr = this.getCleanVersionArray(version);
    let minVersionArr = this.getCleanVersionArray(minVersion);
    for (let i=0; i<minVersionArr.length; i++) {
      if (minVersionArr[i] > versionTestArr[i]) {
        return false;
      } else if (minVersionArr[i] < versionTestArr[i]) {
        return true;
      }
    }

    return true;
  },

  /**
   * Get the version numbers separated by dot
   * For example: if you haver version 0.3.1-beta you will get ['0', '3', '1']
   *
   * @param {string} version
   *
   * @return {Array} Array of numbers with each version number
   *
   * @memberof Helpers
   * @inner
   */
  getCleanVersionArray(version) {
    return version.replace(/[^\d.]/g, '').split('.');
  },

  /**
   * @deprecated since version 0.25.0.
   *
   * You should use the methods in src/config.ts instead.
   */
  getServerURL() {
    return config.getServerUrl();
  },

  /**
   * Get the URL to connect to the websocket from the server URL of the wallet
   *
   * @return {string} Websocket URL
   *
   * @memberof Helpers
   * @inner
   */
  getWSServerURL(url = null) {
    let serverURL;
    if (url === null) {
      serverURL = config.getServerUrl();
    } else {
      serverURL = url;
    }

    const pieces = serverURL.split(':');
    const firstPiece = pieces.splice(0, 1);
    let protocol = '';
    if (firstPiece[0].indexOf('s') > -1) {
      // Has ssl
      protocol = 'wss';
    } else {
      // No ssl
      protocol = 'ws';
    }
    serverURL = path.join(`${pieces.join(':')}`, 'ws/');
    serverURL = `${protocol}:/${serverURL}`;
    return serverURL;
  },

  /**
   * Axios fails merging this configuration to the default configuration because it has an issue
   * with circular structures: https://github.com/mzabriskie/axios/issues/370
   * Got this code from https://github.com/softonic/axios-retry/blob/master/es/index.js#L203
   *
   * @param {Object} axios Axios instance
   * @param {Object} config New axios config
   *
   * @memberof Helpers
   * @inner
   */
  fixAxiosConfig(axios, config) {
    if (axios.defaults.agent === config.agent) {
      delete config.agent;
    }
    if (axios.defaults.httpAgent === config.httpAgent) {
      delete config.httpAgent;
    }
    if (axios.defaults.httpsAgent === config.httpsAgent) {
      delete config.httpsAgent;
    }

    config.transformRequest = [data => data];
  },

  /**
   * Returns the right string depending on the quantity (plural or singular)
   *
   * @param {number} quantity Value considered to check plural or singular
   * @param {string} singular String to be returned in case of singular
   * @param {string} plural String to be returned in case of plural
   *
   * @return {string} plural or singular
   * @memberof Helpers
   * @inner
   *
   */
  plural(quantity, singular, plural) {
    if (quantity === 1) {
      return singular;
    } else {
      return plural;
    }
  },

  /**
   * Return the count of element inside the array
   *
   * @param {Array} array The array where the element is
   * @param {*} element The element that will be counted how many time appears in the array
   *
   * @return {number} count of the element inside the array
   * @memberof Helpers
   * @inner
   */
  elementCount(array, element) {
    let count = 0;
    for (const el of array) {
      if (el === element) {
        count++;
      }
    }
    return count;
  },

  /**
   * Calculates the minimum allowed amount in the wallet (smallest possible decimal value)
   *
   * @return {float} Minimum amount
   * @memberof Helpers
   * @inner
   *
   */
  minimumAmount() {
    return 1 / (10**DECIMAL_PLACES);
  },

  /**
   * Returns a string with the short version of the id of a transaction
   * Returns {first12Chars}...{last12Chars}
   *
   * @param {string} hash Transaction ID to be shortened
   *
   * @return {string}
   * @memberof Helpers
   * @inner
   *
   */
  getShortHash(hash) {
    return `${hash.substring(0,12)}...${hash.substring(52,64)}`;
  },

  /**
   * Cleans a string for comparison. Remove multiple spaces, and spaces at the beginning and end, and transform to lowercase.
   *
   * @param {string} string String to be cleaned
   *
   * @return {string} String after clean
   * @memberof Helpers
   * @inner
   *
   */
  cleanupString(string) {
    return string.replace(/\s\s+/g, ' ').trim().toLowerCase();
  },

  /**
   * Handle error for method transaction.prepareData
   * Check if error is one of the expected and return the message
   * Otherwise, throws the unexpected error
   *
   * @param {Error} e Error thrown
   *
   * @return {string} Error message
   * @memberof Helpers
   * @inner
   */
  handlePrepareDataError(e) {
    if (e instanceof AddressError ||
        e instanceof OutputValueError ||
        e instanceof ConstantNotSet ||
        e instanceof CreateTokenTxInvalid ||
        e instanceof MaximumNumberOutputsError ||
        e instanceof MaximumNumberInputsError) {
      return e.message;
    } else {
      // Unhandled error
      throw e;
    }
  },

  /**
   * Validate an xpubkey.
   *
   * @param {string} xpubkey The xpubkey
   *
   * @return {boolean} true if it's a valid xpubkey, false otherwise
   * @memberof Helpers
   * @inner
   */
  isXpubKeyValid(xpubkey) {
    try {
      HDPublicKey(xpubkey);
      return true
    } catch (error) {
      return false;
    }
  },

  /**
   * Get Hathor addresses in bulk, passing the start index and quantity of addresses to be generated
   *
   * @example
   * ```
   * getAddresses('myxpub', 2, 3, 'mainnet') => {
   *   'address2': 2,
   *   'address3': 3,
   *   'address4': 4,
   * }
   * ```
   *
   * @param {string} xpubkey The xpubkey
   * @param {number} startIndex Generate addresses starting from this index
   * @param {number} quantity Amount of addresses to generate
   * @param {string} networkName 'mainnet' or 'testnet'
   *
   * @return {Object} An object with the generated addresses and corresponding index (string => number)
   * @throws {XPubError} In case the given xpub key is invalid
   * @memberof Helpers
   * @inner
   */
  getAddresses(xpubkey, startIndex, quantity, networkName) {
    let xpub = null;
    try {
      xpub = HDPublicKey(xpubkey);
    } catch (error) {
      throw new XPubError(error.message);
    }

    if (networkName) {
      network.setNetwork(networkName);
    }

    const addrMap = {};
    for (let index = startIndex; index < startIndex + quantity; index++) {
      const key = xpub.deriveChild(index);
      const address = Address(key.publicKey, network.getNetwork());
      addrMap[address.toString()] = index;
    }
    return addrMap;
  }
}

export default helpers;

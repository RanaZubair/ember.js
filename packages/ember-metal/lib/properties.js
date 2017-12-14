/**
@module @ember/object
*/

import { assert } from 'ember-debug';
import { DEBUG } from 'ember-env-flags';
import { meta as metaFor, peekMeta, UNDEFINED } from './meta';
import { overrideChains } from './property_events';
import { MANDATORY_SETTER } from 'ember/features';
// ..........................................................
// DESCRIPTOR
//

/**
  Objects of this type can implement an interface to respond to requests to
  get and set. The default implementation handles simple properties.

  @class Descriptor
  @private
*/
export function Descriptor() {
  this.isDescriptor = true;
}

// ..........................................................
// DEFINING PROPERTIES API
//

export function MANDATORY_SETTER_FUNCTION(name) {
  function SETTER_FUNCTION(value) {
    let m = peekMeta(this);
    if (!m.isInitialized(this)) {
      m.writeValues(name, value);
    } else {
      assert(`You must use set() to set the \`${name}\` property (of ${this}) to \`${value}\`.`, false);
    }
  }

  SETTER_FUNCTION.isMandatorySetter = true;
  return SETTER_FUNCTION;
}

export function MANDATORY_GETTER_FUNCTION(name) {
  return function GETTER_FUNCTION() {
    assert(`You must use get() to access the \`${name}\` property (of ${this}).`, false);
  };
}

export function DEFAULT_GETTER_FUNCTION(name) {
  return function GETTER_FUNCTION() {
    let meta = peekMeta(this);
    if (meta !== undefined) {
      return meta.peekValues(name);
    }
  };
}

export function INHERITING_GETTER_FUNCTION(name) {
  function IGETTER_FUNCTION() {
    let meta = peekMeta(this);
    let val;
    if (meta !== undefined) {
      val = meta.readInheritedValue('values', name);
    }

    if (val === UNDEFINED) {
      let proto = Object.getPrototypeOf(this);
      return proto && proto[name];
    } else {
      return val;
    }
  }

  IGETTER_FUNCTION.isInheritingGetter = true;
  return IGETTER_FUNCTION;
}

/**
  NOTE: This is a low-level method used by other parts of the API. You almost
  never want to call this method directly. Instead you should use
  `mixin()` to define new properties.

  Defines a property on an object. This method works much like the ES5
  `Object.defineProperty()` method except that it can also accept computed
  properties and other special descriptors.

  Normally this method takes only three parameters. However if you pass an
  instance of `Descriptor` as the third param then you can pass an
  optional value as the fourth parameter. This is often more efficient than
  creating new descriptor hashes for each property.

  ## Examples

  ```javascript
  import { defineProperty, computed } from '@ember/object';

  // ES5 compatible mode
  defineProperty(contact, 'firstName', {
    writable: true,
    configurable: false,
    enumerable: true,
    value: 'Charles'
  });

  // define a simple property
  defineProperty(contact, 'lastName', undefined, 'Jolley');

  // define a computed property
  defineProperty(contact, 'fullName', computed('firstName', 'lastName', function() {
    return this.firstName+' '+this.lastName;
  }));
  ```

  @private
  @method defineProperty
  @for @ember/object
  @param {Object} obj the object to define this property on. This may be a prototype.
  @param {String} keyName the name of the property
  @param {Descriptor} [desc] an instance of `Descriptor` (typically a
    computed property) or an ES5 descriptor.
    You must provide this or `data` but not both.
  @param {*} [data] something other than a descriptor, that will
    become the explicit value of this property.
*/
export function defineProperty(obj, keyName, desc, data, meta) {
  if (meta === undefined) { meta = metaFor(obj); }

  let watchEntry = meta.peekWatching(keyName);
  let watching = watchEntry !== undefined && watchEntry > 0;
  let possibleDesc = meta.peekDescriptors(keyName);
  let wasDescriptor = possibleDesc !== undefined;

  if (wasDescriptor) {
    possibleDesc.teardown(obj, keyName, meta);
    meta.removeDescriptors(keyName);
  }

  let value;
  if (desc instanceof Descriptor) {
    value = desc;

    meta.writeDescriptors(keyName, value);

    if (MANDATORY_SETTER && watching) {
      Object.defineProperty(obj, keyName, {
        configurable: true,
        enumerable: true,
        get: MANDATORY_GETTER_FUNCTION(keyName),
        set: MANDATORY_SETTER_FUNCTION(keyName)
      });
    } else {
      Object.defineProperty(obj, keyName, {
        configurable: true,
        enumerable: true,
        get: MANDATORY_GETTER_FUNCTION(keyName)
      });
    }

    didDefineComputedProperty(obj.constructor);

    if (typeof desc.setup === 'function') { desc.setup(obj, keyName); }
  } else if (desc === undefined || desc === null) {
    value = data;

    if (MANDATORY_SETTER && watching) {
      meta.writeValues(keyName, data);

      Object.defineProperty(obj, keyName, {
        configurable: true,
        enumerable: true,
        set: MANDATORY_SETTER_FUNCTION(keyName),
        get: DEFAULT_GETTER_FUNCTION(keyName)
      });
    } else if (wasDescriptor) {
      Object.defineProperty(obj, keyName, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      obj[keyName] = value;
    }
  } else {
    value = desc;

    // fallback to ES5
    Object.defineProperty(obj, keyName, desc);
  }

  // if key is being watched, override chains that
  // were initialized with the prototype
  if (watching) { overrideChains(obj, keyName, meta); }

  // The `value` passed to the `didDefineProperty` hook is
  // either the descriptor or data, whichever was passed.
  if (typeof obj.didDefineProperty === 'function') { obj.didDefineProperty(obj, keyName, value); }

  return this;
}

let hasCachedComputedProperties = false;
export function _hasCachedComputedProperties() {
  hasCachedComputedProperties = true;
}

function didDefineComputedProperty(constructor) {
  if (hasCachedComputedProperties === false) { return; }
  let cache = metaFor(constructor).readableCache();

  if (cache && cache._computedProperties !== undefined) {
    cache._computedProperties = undefined;
  }
}

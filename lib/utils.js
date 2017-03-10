"use strict";

const MULTIPLIER = 0x10000;
const BASE_16 = 16;
module.exports.guid = () => {
  const s4 = () => Math.floor((1 + Math.random()) * MULTIPLIER)
      .toString(BASE_16)
      .substring(1);
  return `${s4() + s4() }-${ s4() }-${ s4() }-${ s4() }-${ s4() }${s4() }${s4()}`;
};

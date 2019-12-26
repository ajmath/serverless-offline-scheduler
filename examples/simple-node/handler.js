'use strict';

module.exports.hello = async (...args) => {
  console.log("Executing func with args: ", JSON.stringify({ args }, null, 2));
  return { message: 'Go Serverless v1.0! Your function executed successfully!' };
};

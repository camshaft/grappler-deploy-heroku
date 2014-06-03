/**
 * Module dependencies
 */

var chain = require('slide').chain;
var last = chain.last;
var anvil = require('anvil-cli');
var API = require('./api');
var write = require('fs').writeFile;

var APP_NAME_LENGTH = 30;

/**
 * Create a Heroku hook
 *
 * @param {Object} config
 * @return {Function}
 */

module.exports = function(config) {
  config = config || {};

  var token = config.token;
  var prefix = config.prefix;

  if (!token) throw new Error('missing heroku token');
  if (!prefix) throw new Error('missing heroku prefix');

  var api = new API(token);

  return function(app) {
    app.deploy('heroku', deploy);
    app.test('heroku', test);

    app.on('task', function(task) {
      task.on('deleted', function() {
        remove(task, task.createLogger('heroku'));
      });

      task.use(function(task, done) {
        var buildpacks = task.info.buildpacks;
        if (!Array.isArray(buildpacks)) return done();
        task.info.buildpacks = 'https://github.com/ddollar/heroku-buildpack-multi.git';
        var out = task.dir + '/.buildpacks';
        write(out, buildpacks.join('\n'), done);
      });
    });
  };

  function deploy(task, log, fn) {
    task.info.app = createName(prefix, task);

    // TODO handle multi region

    chain([
      [api, 'exists', task, log],
      [api, 'create', last, task, log],
      [api, 'enableFeatures', task, log],
      [api, 'addCollaborators', task, log],
      [api, 'addDrains', task, log],
      [api, 'provisionResources', task, log],
      [api, 'setErrorPage', task, log],
      [api, 'setEnv', task, log],
      [api, 'addDomains', task, log],
      [createSlug, task, log],
      [api, 'release', task, log]
    ], function(err) {
      if (err) log('' + (err.stack || err));
      fn(err);
    });
  }

  function remove(task, log) {
    task.info.app = createName(prefix, task);
    api.remove(task, log);
  }

  function test(task, log, fn) {
    task.info.app = createName(prefix, task);
    api.test(task, log, fn);
  }
};

function createName(prefix, task) {
  // TODO hash the task info (env, buildpack, etc) as well
  return (prefix + '-' + task.info.sha).slice(0, APP_NAME_LENGTH);
}

function createSlug(task, log, fn) {
  var dir = task.dir;
  var env = task.info.env;
  log('building slug');

  var opts = {
    buildpack: task.info.buildpacks,
    logger: log,
    env: env
  };

  anvil(dir, opts, function(err, slug, cache) {
    if (err) return fn(err);
    task.info.slug = slug;
    fn();
  });
}

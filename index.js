/**
 * Module dependencies
 */

var chain = require('slide').chain;
var last = chain.last;
var Heroku = require('heroku-client');
var anvil = require('anvil-cli');
var superagent = require('superagent');
var each = require('p-each');

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

  var client = new Heroku({token: token});
  var api = new API(client, token);

  return function(app) {
    app.deploy('heroku', deploy);
    app.test('heroku', test);

    app.on('task', function(task) {
      task.on('deleted', function() {
        remove(task, task.createLogger('heroku'));
      });
    });
  };

  function deploy(task, log, fn) {
    task.info.app = createName(prefix, task);

    chain([
      [api, 'exists', task, log],
      [api, 'create', last, task, log],
      [api, 'enableFeature', 'log-runtime-metrics', task, log],
      [api, 'addDrains', task, log],
      [createSlug, task, log],
      [api, 'release', task, log]
    ], fn);
  }

  function remove(task, log) {
    task.info.app = createName(prefix, task);
    api.remove(task, log);
  }

  function test(task, log, fn) {
    // TODO run the tests on heroku
  }
};

function createName(prefix, task) {
  // TODO hash the task info (env, buildpack, etc) as well
  return (prefix + '-' + task.sha).slice(0, APP_NAME_LENGTH);
}

function API(client, token) {
  this.client = client;
  this.token = token;
}

API.prototype.exists = function(task, log, fn) {
  var app = task.info.app;
  log('checking existance of ' + app);
  this.client.apps(app).info(function(err, info) {
    if (err && err.statusCode === 404) return fn(null, false);
    if (err) return fn(err);
    fn(null, true);
  });
};

API.prototype.create = function(exists, task, log, fn) {
  if (exists) return fn();
  var app = task.info.app;
  var params = {
    name: app
  };
  log('creating ' + app);
  this.client.apps().create(params, fn);
};

API.prototype.enableFeature = function(feature, task, log, fn) {
  var app = task.info.app;
  log('enabling feature ' + feature + ' on ' + app);
  this.client.apps(app).features(feature).update({enabled: true}, function(err) {
    fn(err);
  });
};

API.prototype.addDrains = function(task, log, fn) {
  var drains = task.info.drains;
  if (!drains) return fn();

  if (!Array.isArray(drains)) drains = [drains];
  var app = task.info.app;

  var client = this.client;

  each(drains, function(drain, fn) {
    log('adding log drain ' + drain + ' to ' + app);
    client.apps(app).logDrains().create({url: drain}, function(err) {
      if (err && err.statusCode === 422) return fn();
      if (err) return fn(err);
      fn();
    });
  }, fn);
};

API.prototype.release = function(task, log, fn) {
  var app = task.info.app;
  var url = task.info.slug;
  log('releasing slug to ' + app);

  var host = 'https://:' + this.token + '@cisaurus.heroku.com';

  superagent
    .post(host + '/v1/apps/' + app + '/release')
    .send({description: 'Building from grappler', slug_url: url})
    .end(function(err, res) {
      if (err) return fn(err);
      if (res.status === 202) return poll(res.header['location']);
      if (res.error) return fn(new Error(res.body ? res.body.error : res.text));
      fn(null);
    });

  function poll(location) {
    setTimeout(function() {
      superagent
        .get(host + location)
        .end(function(err, res) {
          if (err) return fn(err);
          if (res.status === 202) return poll(location);
          if (res.error) return fn(new Error(res.text));
          log('release ' + res.body.release);
          fn(null);
        });
    }, 2000);
  }
};

API.prototype.test = function(task, log, fn) {
  var test = task.info.test;
  if (!test) return fn();
  var app = task.info.app;

  log('running test command: ' + test);

  // TODO
  // this.client.apps(app).dynos().create({command: '', attach: true, env: {}}, fn);

  fn();
}

API.prototype.delete = function(task, log, fn) {
  var app = task.info.app;
  log('deleting app ' + app);
  this.client.apps(app).delete(fn);
}

function createSlug(task, log, fn) {
  var dir = task.dir;
  var env = task.info.env;
  log('building slug');

  var opts = {
    buildpack: 'https://github.com/ddollar/heroku-buildpack-multi.git',
    logger: log,
    env: env
  };

  anvil(dir, opts, function(err, slug) {
    if (err) return fn(err);
    task.info.slug = slug;
    fn();
  });
}

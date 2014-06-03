/**
 * Module dependencies
 */

var superagent = require('superagent');
var each = require('p-each');
var Heroku = require('heroku-client');

module.exports = API;

function API(token) {
  this.client = new Heroku({token: token});
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

API.prototype.enableFeatures = function(task, log, fn) {
  var app = task.info.app;
  var client = this.client;
  each(task.info.labs || [], function(feature, done) {
    log('enabling feature ' + feature + ' on ' + app);
    client.apps(app).features(feature).update({enabled: true}, done);
  }, fn);
};

API.prototype.addCollaborators = function(task, log, fn) {
  var app = task.info.app;
  var client = this.client;
  each(task.info.collaborators || [], function(collaborator, done) {
    log('adding collaborator ' + collaborator + ' on ' + app);
    client.apps(app).collaborators().create({user: collaborator, silent: true}, done);
  }, fn);
};

API.prototype.provisionResources = function(task, log, fn) {
  // TODO
  fn();
};

API.prototype.setEnv = function(task, log, fn) {
  var env = task.info.env;
  if (!env) return fn();
  log('setting env variables');
  var app = task.info.app;
  this.client.apps(app).configVars().update(env, fn);
};

API.prototype.addDomains = function(task, log, fn) {
  var app = task.info.app;
  var client = this.client;
  each(task.info.domains || [], function(domain, done) {
    log('adding domain ' + domain + ' on ' + app);
    client.apps(app).domains().create({hostname: domain}, done);
  }, fn);
};

API.prototype.setErrorPage = function(task, log, fn) {
  var page = task.info.errorPage;
  if (!page) return fn();
  var app = task.info.app;
  log('setting error page to ' + page + ' on ' + app);
  task.info.env.ERROR_PAGE_URL = page;
  fn();
};

API.prototype.addDrains = function(task, log, fn) {
  var drains = task.info.drains;
  if (!drains) return fn();

  if (!Array.isArray(drains)) drains = [drains];
  var app = task.info.app;

  var client = this.client;

  each(drains, function(drain, done) {
    log('adding log drain ' + drain + ' to ' + app);
    client.apps(app).logDrains().create({url: drain}, function(err) {
      if (err && err.statusCode === 422) return done();
      if (err) return done(err);
      done();
    });
  }, fn);
};

API.prototype.release = function(task, log, fn) {
  var app = task.info.app;
  var url = task.info.slug;
  log('releasing slug to ' + app);

  var host = 'https://:' + this.token + '@cisaurus.heroku.com';

  console.log(url);

  superagent
    .post(host + '/v1/apps/' + app + '/release')
    .send({description: 'Building from grappler', slug_url: url})
    .end(function(err, res) {
      if (err) return fn(err);
      if (res.status === 202) return poll(res.header['location']);
      if (res.error) return fn(new Error(errorMessage(res)));
      fn(null);
    });

  function poll(location) {
    setTimeout(function() {
      superagent
        .get(host + location)
        .end(function(err, res) {
          if (err) return fn(err);
          if (res.status === 202) return poll(location);
          if (res.error) return fn(new Error(errorMessage(res)));
          log('release ' + res.body.release);
          fn(null);
        });
    }, 2000);
  }
};

function errorMessage(res) {
  if (res.body.error) return res.body.error;
  if (res.text) return res.text;
  return res.error;
}

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

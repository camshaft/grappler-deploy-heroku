var heroku = require('..');

var deploy = heroku({
  token: process.env.HEROKU_API_TOKEN,
  prefix: 'gs',
  drain: 'http://example.com'
});

var task = {
  repo: 'github-hooks-testing',
  branch: 'master',
  event: 'push',
  dir: __dirname + '/../../github-hooks-testing'
};

function log(str) {
  console.log(str);
}

deploy(task, log, function(err) {
  if (err) console.error(err.stack || err.message);
});

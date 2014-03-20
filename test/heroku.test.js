var heroku = require('..');

var deploy = heroku({token: process.env.HEROKU_API_TOKEN, prefix: 'gp'});

var task = {
  repo: 'github-hooks-testing',
  branch: 'master',
  event: 'push'
};

function log(str) {
  console.log(str);
}

deploy(task, log, function(err) {
  console.log(err);
  if (err) console.error(err.stack || err.message);
});

const childProcess = require('child_process');

const semver = require('semver');

const pkg = require('../package');

const getVersions = () => {
  const pgVersion = pkg.peerDependencies.pg;
  const versionsBuffer = childProcess.execSync('npm info pg versions --json');
  const versions = JSON.parse(versionsBuffer.toString());
  const eligibleVersions = versions.filter(version => semver.satisfies(version, pgVersion));
  return eligibleVersions;
};
module.exports = getVersions;

if (!module.parent) {
  // eslint-disable-next-line no-console
  console.log(getVersions().join('\n'));
}

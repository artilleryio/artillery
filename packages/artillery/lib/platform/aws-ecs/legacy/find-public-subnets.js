const assert = require('assert').strict;
const AWS = require('aws-sdk');

class VPCSubnetFinder {
  constructor(opts) {
    this.ec2 = new AWS.EC2(opts);
  }

  async getRouteTables(vpcId) {
    try {
      const rts = await this.ec2
        .describeRouteTables({
          Filters: [
            {
              Name: 'vpc-id',
              Values: [vpcId]
            }
          ]
        })
        .promise();

      return rts.RouteTables;
    } catch (err) {
      throw err;
    }
  }

  async findDefaultVpc() {
    try {
      const vpcRes = await this.ec2
        .describeVpcs({
          Filters: [
            {
              Name: 'isDefault',
              Values: ['true']
            }
          ]
        })
        .promise();

      assert.ok(vpcRes.Vpcs.length <= 1);

      if (vpcRes.Vpcs.length !== 1) {
        return null;
      } else {
        return vpcRes.Vpcs[0].VpcId;
      }
    } catch (err) {
      throw err;
    }
  }

  async getSubnets(vpcId) {
    // Get subnets fileterd by VPC id
    try {
      const subRes = await this.ec2
        .describeSubnets({
          Filters: [
            {
              Name: 'vpc-id',
              Values: [vpcId]
            }
          ]
        })
        .promise();

      return subRes.Subnets;
    } catch (err) {
      throw err;
    }
  }

  isSubnetPublic(routeTables, subnetId) {
    //
    // Inspect associations of each route table (of a specific VPC). A route
    // table record has an Associations field, which is a list of association
    // objects. There are two types of those:
    //
    // 1. An implicit association, which is indicated by field Main set to
    //    true and no explicit subnet id.
    // 2. An explicit association, which is indicated by field Main set to
    //    false, and a SubnetId field containing a subnet id.
    //

    // Route table for the subnet - can there only be one?
    let subnetTable = routeTables.filter((rt) => {
      const explicitAssoc = rt.Associations.filter((assoc) => {
        return assoc.SubnetId && assoc.SubnetId === subnetId;
      });

      assert.ok(explicitAssoc.length <= 1);

      return explicitAssoc.length === 1;
    });

    if (subnetTable.length === 0) {
      // There is no explicit association for this subnet so it will be implicitly
      // associated with the VPC's main routing table.
      subnetTable = routeTables.filter((rt) => {
        const implicitAssoc = rt.Associations.filter((assoc) => {
          return assoc.Main === true;
        });

        assert.ok(implicitAssoc.length <= 1);

        return implicitAssoc.length === 1;
      });
    }

    if (subnetTable.length !== 1) {
      throw new Error(
        `Could not locate routing table for subnet: subnet id: ${subnetId}`
      );
    }

    const igwRoutes = subnetTable[0].Routes.filter((route) => {
      // NOTE: there may be no IGW attached to route
      return route.GatewayId && route.GatewayId.startsWith('igw-');
    });

    return igwRoutes.length > 0;
  }

  // TODO: Distinguish between there being no default VPC,
  // or being given an invalid VPC ID, and no public subnets
  // existing in a VPC that definitely exists.
  async findPublicSubnets(vpcId) {
    if (!vpcId) {
      vpcId = await this.findDefaultVpc();
    }
    const rts = await this.getRouteTables(vpcId);
    const subnets = await this.getSubnets(vpcId);

    const publicSubnets = subnets.filter((subnet) => {
      return this.isSubnetPublic(rts, subnet.SubnetId);
    });

    return publicSubnets;
  }
}

async function main() {
  const f = new VPCSubnetFinder({ region: process.env.REGION });

  try {
    const publicSubnets = await f.findPublicSubnets(process.env.VPC_ID);
    console.log(publicSubnets.map((s) => s.SubnetId).join('\n'));
  } catch (err) {
    console.log(err);
  }
}

if (require.main == module) {
  main();
}

module.exports = { VPCSubnetFinder };

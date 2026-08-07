import { strict as assert } from 'node:assert';
import {
  DescribeRouteTablesCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  type EC2ClientConfig,
  type RouteTable,
  type Subnet
} from '@aws-sdk/client-ec2';

class VPCSubnetFinder {
  declare ec2: EC2Client;

  constructor(opts: EC2ClientConfig) {
    this.ec2 = new EC2Client(opts);
  }

  async getRouteTables(vpcId: string) {
    const rts = await this.ec2.send(
      new DescribeRouteTablesCommand({
        Filters: [
          {
            Name: 'vpc-id',
            Values: [vpcId]
          }
        ]
      })
    );

    return rts.RouteTables;
  }

  async findDefaultVpc() {
    const vpcRes = await this.ec2.send(
      new DescribeVpcsCommand({
        Filters: [
          {
            Name: 'isDefault',
            Values: ['true']
          }
        ]
      })
    );

    // NOTE: pre-existing behavior: throws when the API returns no
    // Vpcs field at all.
    const vpcs = vpcRes.Vpcs as NonNullable<typeof vpcRes.Vpcs>;
    assert.ok(vpcs.length <= 1);

    if (vpcs.length !== 1) {
      return null;
    } else {
      return vpcs[0].VpcId;
    }
  }

  async getSubnets(vpcId: string) {
    const subRes = await this.ec2.send(
      new DescribeSubnetsCommand({
        Filters: [
          {
            Name: 'vpc-id',
            Values: [vpcId]
          }
        ]
      })
    );

    return subRes.Subnets;
  }

  isSubnetPublic(routeTables: RouteTable[], subnetId: string | undefined) {
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
      const explicitAssoc = (
        rt.Associations as NonNullable<typeof rt.Associations>
      ).filter((assoc) => {
        return assoc.SubnetId && assoc.SubnetId === subnetId;
      });

      assert.ok(explicitAssoc.length <= 1);

      return explicitAssoc.length === 1;
    });

    if (subnetTable.length === 0) {
      // There is no explicit association for this subnet so it will be implicitly
      // associated with the VPC's main routing table.
      subnetTable = routeTables.filter((rt) => {
        const implicitAssoc = (
          rt.Associations as NonNullable<typeof rt.Associations>
        ).filter((assoc) => {
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

    const igwRoutes = (
      subnetTable[0].Routes as NonNullable<(typeof subnetTable)[0]['Routes']>
    ).filter((route) => {
      // NOTE: there may be no IGW attached to route
      return route.GatewayId?.startsWith('igw-');
    });

    return igwRoutes.length > 0;
  }

  // TODO: Distinguish between there being no default VPC,
  // or being given an invalid VPC ID, and no public subnets
  // existing in a VPC that definitely exists.
  async findPublicSubnets(vpcId?: string | null): Promise<Subnet[]> {
    if (!vpcId) {
      vpcId = await this.findDefaultVpc();
    }
    // NOTE: pre-existing behavior: a missing VPC/API response fields
    // surface as runtime errors here.
    const rts = (await this.getRouteTables(vpcId as string)) as RouteTable[];
    const subnets = (await this.getSubnets(vpcId as string)) as Subnet[];

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

if (process.argv[1] === import.meta.filename) {
  main();
}

export { VPCSubnetFinder };

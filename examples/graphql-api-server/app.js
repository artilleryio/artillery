const { ApolloServer, gql } = require('apollo-server');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const typeDefs = gql`
  input UserInput {
    username: String
    email: String
  }

  type User {
    id: ID!
    username: String
    email: String
  }

  type Query {
    users: [User]
    user(id: ID!): User
    userByUsername(username: String!): User
    userByEmail(username: String!): User
  }

  type Mutation {
    createUser(input: UserInput): User
    updateUser(id: ID!, input: UserInput): User
    deleteUser(id: ID!): User
  }
`;

const resolvers = {
  Query: {
    users: async () => {
      return await prisma.user.findMany();
    },

    user: async (_, { id }) => {
      return await prisma.user.findUnique({
        where: { id: parseInt(id, 10) }
      });
    },

    userByEmail: async (_, { email }) => {
      return await prisma.user.findUnique({
        where: { email }
      });
    },

    userByUsername: async (_, { username }) => {
      return await prisma.user.findUnique({
        where: { username }
      });
    }
  },

  Mutation: {
    createUser: async (_, { input }) => {
      return await prisma.user.create({
        data: input
      });
    },

    updateUser: async (_, { id, input }) => {
      return await prisma.user.update({
        where: { id: parseInt(id, 10) },
        data: input
      });
    },

    deleteUser: async (_, { id }) => {
      return await prisma.user.delete({
        where: { id: parseInt(id, 10) }
      });
    }
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});

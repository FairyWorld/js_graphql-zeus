import * as fs from 'fs';
import * as path from 'path';
import { TranslateGraphQL, Environment } from 'graphql-zeus-core';
import { TreeToJSONSchema } from 'graphql-zeus-jsonschema';
import { Parser } from 'graphql-js-tree';
import { pluginTypedDocumentNode } from '@/plugins/typedDocumentNode/index.js';
import { Utils } from '@/Utils/index.js';
import { config } from '@/config.js';
/**
 * basic yargs interface
 */
interface Yargs {
  [x: string]: unknown;
  _: (string | number)[];
  $0: string;
}

/**
 * Interface for yargs arguments
 */
interface CliArgs extends Yargs {
  header?: string;
  esModule?: boolean;
  node?: boolean;
  graphql?: string;
  jsonSchema?: string;
  apollo?: boolean;
  constEnums?: boolean;
  reactQuery?: boolean;
  typedDocumentNode?: boolean;
  subscriptions?: string;
  method?: string;
}
/**
 * Main class for controlling CLI
 */
export class CLI {
  /**
   *  Execute yargs provided args
   */
  static execute = async <T extends CliArgs>(args: T): Promise<void> => {
    const env: Environment = args.node ? 'node' : 'browser';
    let schemaFileContents = '';
    const allArgs = args._ as string[];
    const commandLineProvidedOptions = { ...args, urlOrPath: allArgs[0] };
    const schemaFile = await config.getValueOrThrow('urlOrPath', {
      commandLineProvidedOptions,
      saveOnInput: true,
    });
    let host: string | undefined;
    if (schemaFile.startsWith('http://') || schemaFile.startsWith('https://')) {
      const { header, method } = args;
      host = schemaFile;
      schemaFileContents = await Utils.getFromUrl(schemaFile, { header, method: method === 'GET' ? 'GET' : 'POST' });
    }
    schemaFileContents = schemaFileContents || fs.readFileSync(schemaFile).toString();
    const pathToFile = allArgs[1] || '';
    const tree = Parser.parse(schemaFileContents);
    if (args.graphql) {
      const schemaPath =
        args.graphql.endsWith('.graphql') || args.graphql.endsWith('.gql')
          ? args.graphql
          : path.join(args.graphql, 'schema.graphql');

      const pathToSchema = path.dirname(schemaPath);
      const schemaFile = path.basename(schemaPath);
      writeFileRecursive(pathToSchema, schemaFile, schemaFileContents);
    }
    if (args.jsonSchema) {
      const schemaPath = args.jsonSchema.endsWith('.json')
        ? args.jsonSchema
        : path.join(args.jsonSchema, 'schema.json');

      const pathToSchema = path.dirname(schemaPath);
      const schemaFile = path.basename(schemaPath);

      const content = TreeToJSONSchema.parse(tree);
      writeFileRecursive(pathToSchema, schemaFile, JSON.stringify(content, null, 4));
    }
    const typeScriptDefinition = TranslateGraphQL.typescriptSplit({
      schema: schemaFileContents,
      env,
      host,
      esModule: !!args.esModule,
      constEnums: !!args.constEnums,
      subscriptions: args.subscriptions === 'graphql-ws' ? 'graphql-ws' : 'legacy',
    });
    Object.keys(typeScriptDefinition).forEach((k) =>
      writeFileRecursive(
        path.join(pathToFile, 'zeus'),
        `${k}.ts`,
        typeScriptDefinition[k as keyof typeof typeScriptDefinition],
      ),
    );
    if (args.typedDocumentNode) {
      writeFileRecursive(
        path.join(pathToFile, 'zeus'),
        `typedDocumentNode.ts`,
        pluginTypedDocumentNode(commandLineProvidedOptions),
      );
    }
  };
}

function writeFileRecursive(pathToFile: string, filename: string, data: string): void {
  fs.mkdirSync(pathToFile, { recursive: true });
  fs.writeFileSync(path.join(pathToFile, filename), data);
}

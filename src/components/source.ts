import * as vscode from 'vscode';
import fm from 'front-matter';

export type pageMetadata = {
  site: string,
  name: string,
  title?: string,
  parent?: string,
  tags?: string[] | string,
  comments?: string,
  source: string,
}

export function parseMetadata(source: string): pageMetadata {
  let meta: pageMetadata = {
    site: `${vscode.workspace.getConfiguration('ftml.preview').get('wikidot')}`,
    name: '',
    source: '',
  }
  if (fm.test(source)) {
    let fmparsed = fm(source);
    Object.assign(meta, fmparsed.attributes);
    meta.source = fmparsed.body;
  } else meta.source = source;
  return meta;
}
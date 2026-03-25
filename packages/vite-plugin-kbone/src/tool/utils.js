// Copyright (c) 2020 Tencent, a Tencent company
// SPDX-License-Identifier: BSD-3-Clause
//
// Modifications Copyright (c) 2026 Yiwan Zhou
// SPDX-License-Identifier: MIT

import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Deep merge objects
 */
export function merge(to, from) {
  if (typeof to !== 'object' || typeof from !== 'object') return to

  const fromKeys = Object.keys(from)
  for (const key of fromKeys) {
    const fromValue = from[key]
    const fromType = typeof fromValue
    const isFromArray = +Array.isArray(fromValue)
    const toValue = to[key]
    const toType = typeof toValue
    const isToArray = +Array.isArray(toValue)

    if (fromType !== toType || isFromArray ^ isToArray) {
      to[key] = fromValue
    } else {
      if (isFromArray) {
        fromValue.forEach(item => toValue.push(item))
      } else if (fromType === 'object') {
        to[key] = merge(toValue, fromValue)
      } else {
        to[key] = fromValue
      }
    }
  }

  return to
}

/**
 * Check if parentArr includes all elements of childArr
 */
export function includes(parentArr, childArr) {
  for (const child of childArr) {
    if (parentArr.indexOf(child) === -1) return false
  }

  return true
}

/**
 * Check if a file exists
 */
export function isFileExisted(filePath) {
  try {
    fs.accessSync(filePath)
    return true
  } catch (err) {
    return false
  }
}

/**
 * Recursively create directories
 */
export function recursiveMkdir(dirPath) {
  const prevDirPath = path.dirname(dirPath)
  try {
    fs.accessSync(prevDirPath)
  } catch (err) {
    recursiveMkdir(prevDirPath)
  }

  try {
    fs.accessSync(dirPath)

    const stat = fs.statSync(dirPath)
    if (stat && !stat.isDirectory()) {
      fs.renameSync(dirPath, `${dirPath}.bak`)
      fs.mkdirSync(dirPath)
    }
  } catch (err) {
    fs.mkdirSync(dirPath)
  }
}

/**
 * Copy a file
 */
export function copyFile(fromPath, toPath) {
  recursiveMkdir(path.dirname(toPath))
  return fs.createReadStream(fromPath).pipe(fs.createWriteStream(toPath))
}

/**
 * Copy a directory recursively
 */
export function copyDir(fromPath, toPath) {
  try {
    fs.accessSync(fromPath)

    const stat = fs.statSync(fromPath)
    if (stat && !stat.isDirectory()) {
      return console.log(`path is not directory: "${fromPath}"`)
    }
  } catch (err) {
    return console.log(`path not exists: "${fromPath}"`)
  }

  const files = fs.readdirSync(fromPath)
  for (const fileName of files) {
    const filePath = path.join(fromPath, fileName)
    const distFilePath = path.join(toPath, fileName)
    const stat = fs.statSync(filePath)
    if (stat && stat.isDirectory()) {
      copyDir(filePath, distFilePath)
    } else if (stat && stat.isFile()) {
      copyFile(filePath, distFilePath)
    }
  }
}

/**
 * Calculate file md5 hash
 */
export function md5File(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
}

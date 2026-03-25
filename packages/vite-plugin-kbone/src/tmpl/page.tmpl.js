// Copyright (c) 2020 Tencent, a Tencent company
// SPDX-License-Identifier: BSD-3-Clause
//
// Modifications Copyright (c) 2026 Yiwan Zhou
// SPDX-License-Identifier: MIT

const mp = require('miniprogram-render')
const getBaseConfig = require('../base.js')
const config = require('/* CONFIG_PATH */')

/* INIT_FUNCTION */

const baseConfig = getBaseConfig(mp, config, init)

Component({
  ...baseConfig.base,
  methods: {
    ...baseConfig.methods
    /* PAGE_SCROLL_FUNCTION */
    /* REACH_BOTTOM_FUNCTION */
    /* PULL_DOWN_REFRESH_FUNCTION */
  }
})

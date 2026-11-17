/**
 * @file 目录状态。保存编辑器标题目录并提供更新操作。
 */
import { createSlice } from '@reduxjs/toolkit';
export const tocSlice = createSlice({
  name: 'toc',
  initialState: {
    tocItems: [],
  },
  reducers: {
    setTocItems: (state, action) => {
      state.tocItems = action.payload;
    },
  },
});
export const { setTocItems } = tocSlice.actions;
export default tocSlice.reducer;

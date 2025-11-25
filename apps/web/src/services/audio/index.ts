import { SherpaOnnxService } from './sherpa-onnx';
import { TransformersService } from './transformers';

export * from './types';
export { SherpaOnnxService } from './sherpa-onnx';
export { TransformersService } from './transformers';

// シングルトンをエクスポート
export const sherpaService = new SherpaOnnxService();
export const transformersService = new TransformersService();

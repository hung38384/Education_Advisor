import sys
import pickle

with open('app/ai/ml/weights/label_encoder.pkl', 'rb') as f:
    # hack the pickle loading
    class CustomUnpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if module == 'sklearn.preprocessing.label':
                module = 'sklearn.preprocessing._label'
            return super().find_class(module, name)

    try:
        enc = CustomUnpickler(f).load()
        print('CLASSES:', enc.classes_)
    except Exception as e:
        print('Still failed:', e)
